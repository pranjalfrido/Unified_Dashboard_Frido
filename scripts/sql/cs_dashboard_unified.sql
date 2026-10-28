-- CS dashboard unified table.  Scheduled in BigQuery every day at 11:00 IST (05:30 UTC, after the 10:25 IST dbt run) as
-- "cs_dashboard_unified_refresh_schedule"; rebuilt in full each run, like the other production
-- refresh schedules.
--
-- One table, four kinds of row, told apart by record_type:
--   ticket     one row per Freshdesk ticket (all channels), with the first-reply and business-hour
--              response times already worked out
--   call       one row per Ozonetel CALL (call_id), not per ringing attempt
--   agent_day  one row per voice agent per day: login hours
--   order_day  one row per day: Shopify D2C orders, units and revenue
-- Columns that do not apply to a row are NULL. event_date is the IST date the row belongs to
-- (ticket created / call first ring / agent day / order day) and partitions the table.
--
-- Sources
--   frido-429506.Frido_BigQuery.Frido_freshdesk_unified        tickets (times are IST text)
--   frido-429506.Frido_BigQuery.Frido_freshdesk_conversations  messages (created_at is UTC)
--   frido-429506.Frido_BigQuery.Frido_freshdesk_agents         tells agent replies from bot replies
--   frido-429506.frido_big_query.frido_ozonetel_cdr_detailed   calls (from 1 Oct 2026)
--   frido-429506.frido_big_query.frido_ozonetel_agent_state_summary
--   frido-429506.production.fact_all_platform_sales_report     Shopify orders
--
-- Definitions are the ones the dashboard uses (api/customer-support.js):
--   is_interaction        association type Parent or blank
--   is_task               association type Child
--   is_escalation         group Escalations or CXO-Escalations
--   is_customer_initiated not outbound: excludes group 'CS Voice - Outbound Only', source
--                         'Outbound Email' and disposition 'Outbound Call'
--   frt / agent_frt       ticket created -> first public reply from us / from a Freshdesk agent,
--                         in BUSINESS-HOUR seconds: chat, email, escalations 10:00-19:00, social
--                         media 08:00-22:00, every day (IST)
--   ttr_hours             (Resolved time, else Closed time) - Created time, wall-clock hours
--   is_cs_inbound         campaign Inbound_918045152790, type Inbound, first ring 10:00-19:00:59 IST.
--                         Calls are grouped per call_id WITHIN that line (as the dashboard counts
--                         them); rows of the same call_id on other lines form their own 'call' row.
--   replying_agent_ids    Freshdesk agents who sent a public reply on the ticket (for the
--                         'agents available' rows)

CREATE OR REPLACE TABLE `frido-429506.production.cs_dashboard_unified`
PARTITION BY event_date
CLUSTER BY record_type, channel
OPTIONS (description = 'CS dashboard unified table: tickets, calls, agent login hours and Shopify D2C orders (record_type). Rebuilt daily 11:00 IST by scheduled query cs_dashboard_unified_refresh_schedule.')
AS
WITH
-- ---------------------------------------------------------------- tickets
t AS (
  SELECT
    Ticket_ID AS ticket_id,
    SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', Created_Time) AS created_ist,
    Source AS source,
    CASE
      WHEN Source = 'WhatsApp' THEN 'Chat'
      WHEN Source IN ('Email', 'Outbound Email', 'Portal') THEN 'Email'
      WHEN Source IN ('Instagram Message', 'Facebook Comment', 'Facebook Message', '18')
           OR STARTS_WITH(Source, 'Instagram') OR STARTS_WITH(Source, 'Facebook') THEN 'Social media'
      WHEN Source = 'Phone' THEN 'Inbound'
      ELSE 'Other'
    END AS channel,
    Group_Name AS group_name,
    NULLIF(TRIM(Association_Type), '') AS association_type,
    Status AS status,
    Type AS ticket_type,
    NULLIF(TRIM(Agent), '') AS agent_name,
    NULLIF(TRIM(Disposition), '') AS disposition,
    NULLIF(TRIM(Sub_Category), '') AS sub_category,
    NULLIF(TRIM(Sub_Category_2), '') AS sub_category_2,
    COALESCE(NULLIF(Contact_ID, ''), NULLIF(Customer_Phone, ''), NULLIF(Customer_Email, ''), Ticket_ID) AS customer_key,
    Resolution_Time_hrs AS resolution_time_hrs,
    COALESCE(SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', NULLIF(Resolved_Time, '')),
             SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', NULLIF(Closed_Time, ''))) AS resolved_ist,
    Disposition AS disposition_raw
  FROM `frido-429506.Frido_BigQuery.Frido_freshdesk_unified`
),
r AS (
  -- First public reply from us, and first from a real agent. Conversation times are UTC.
  SELECT c.ticket_id,
         DATETIME(MIN(TIMESTAMP(c.created_at)), 'Asia/Kolkata') AS first_reply_ist,
         DATETIME(MIN(IF(a.id IS NOT NULL, TIMESTAMP(c.created_at), NULL)), 'Asia/Kolkata') AS first_agent_reply_ist,
         ARRAY_AGG(DISTINCT IF(a.id IS NOT NULL, c.user_id, NULL) IGNORE NULLS) AS replying_agent_ids
  FROM `frido-429506.Frido_BigQuery.Frido_freshdesk_conversations` c
  LEFT JOIN `frido-429506.Frido_BigQuery.Frido_freshdesk_agents` a ON a.id = c.user_id
  WHERE c.incoming = 'False' AND c.private = 'False'
    AND c.created_at >= '2026-05-31'
  GROUP BY 1
),
tk AS (
  SELECT t.*, r.first_reply_ist, r.first_agent_reply_ist, r.replying_agent_ids,
    IF(t.channel = 'Social media', TIME '08:00:00', TIME '10:00:00') AS bh_start,
    IF(t.channel = 'Social media', TIME '22:00:00', TIME '19:00:00') AS bh_end
  FROM t LEFT JOIN r ON r.ticket_id = t.ticket_id
  WHERE t.created_ist IS NOT NULL
),
ticket_rows AS (
  SELECT
    'ticket' AS record_type,
    DATE(created_ist) AS event_date,
    created_ist AS event_ts,
    ticket_id, source, channel, group_name, association_type, status, ticket_type, agent_name,
    disposition, sub_category, sub_category_2, customer_key,
    COALESCE(association_type, '') IN ('', 'Parent') AS is_interaction,
    association_type = 'Child' AS is_task,
    group_name IN ('Escalations', 'CXO-Escalations') AS is_escalation,
    NOT (group_name = 'CS Voice - Outbound Only' OR source = 'Outbound Email' OR disposition_raw = 'Outbound Call') AS is_customer_initiated,
    status IN ('Resolved', 'Closed') AS is_resolved,
    resolved_ist AS resolved_ts,
    IF(resolved_ist >= created_ist, DATETIME_DIFF(resolved_ist, created_ist, SECOND) / 3600, NULL) AS ttr_hours,
    resolution_time_hrs,
    first_reply_ist AS first_reply_ts,
    first_agent_reply_ist AS first_agent_reply_ts,
    IF(first_reply_ist IS NULL OR first_reply_ist < created_ist, NULL, (
      SELECT SUM(GREATEST(0, DATETIME_DIFF(LEAST(first_reply_ist, DATETIME(d, bh_end)), GREATEST(created_ist, DATETIME(d, bh_start)), SECOND)))
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE(created_ist), DATE(first_reply_ist))) d)) AS frt_bh_seconds,
    IF(first_agent_reply_ist IS NULL OR first_agent_reply_ist < created_ist, NULL, (
      SELECT SUM(GREATEST(0, DATETIME_DIFF(LEAST(first_agent_reply_ist, DATETIME(d, bh_end)), GREATEST(created_ist, DATETIME(d, bh_start)), SECOND)))
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE(created_ist), DATE(first_agent_reply_ist))) d)) AS agent_frt_bh_seconds,
    replying_agent_ids
  FROM tk
),
-- ---------------------------------------------------------------- calls
call_rows AS (
  SELECT call_id, caller_id, campaign_name, type AS call_type, call_date, start_time, status = 'Answered' AS answered,
    LOWER(type) = 'inbound' AND campaign_name = 'Inbound_918045152790' AS on_cs_line,
    TIME_DIFF(SAFE.PARSE_TIME('%H:%M:%S', NULLIF(time_to_answer, '')), TIME '00:00:00', SECOND) AS tta,
    TIME_DIFF(SAFE.PARSE_TIME('%H:%M:%S', NULLIF(handling_time, '')), TIME '00:00:00', SECOND) AS ht,
    TIME_DIFF(SAFE.PARSE_TIME('%H:%M:%S', NULLIF(wrapup_duration, '')), TIME '00:00:00', SECOND) AS acw
  FROM `frido-429506.frido_big_query.frido_ozonetel_cdr_detailed`
  WHERE NULLIF(call_id, '') IS NOT NULL
),
calls AS (
  SELECT call_id, on_cs_line,
    ANY_VALUE(caller_id) AS caller_id, ANY_VALUE(campaign_name) AS campaign_name, ANY_VALUE(call_type) AS call_type,
    MIN(call_date) AS call_date, MIN(start_time) AS first_start,
    LOGICAL_OR(answered) AS answered,
    MAX(IF(answered, tta, NULL)) AS tta, MAX(IF(answered, ht, NULL)) AS ht, MAX(IF(answered, acw, NULL)) AS acw
  FROM call_rows GROUP BY call_id, on_cs_line
),
call_out AS (
  SELECT
    'call' AS record_type,
    SAFE.PARSE_DATE('%Y-%m-%d', call_date) AS event_date,
    SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', CONCAT(call_date, ' ', first_start)) AS event_ts,
    call_id, caller_id, campaign_name, call_type, answered AS is_answered,
    on_cs_line AND first_start >= '10:00:00' AND first_start < '19:01:00' AS is_cs_inbound,
    tta AS time_to_answer_s, ht AS handling_s, acw AS wrapup_s
  FROM calls
),
-- ---------------------------------------------------------------- agent login days
agent_out AS (
  SELECT 'agent_day' AS record_type,
    SAFE.PARSE_DATE('%Y-%m-%d', call_date) AS event_date,
    agent_name,
    TIME_DIFF(SAFE.PARSE_TIME('%H:%M:%S', NULLIF(total_login_duration, '')), TIME '00:00:00', SECOND) / 3600 AS login_hours
  FROM `frido-429506.frido_big_query.frido_ozonetel_agent_state_summary`
),
-- ---------------------------------------------------------------- Shopify D2C orders per day
order_out AS (
  SELECT 'order_day' AS record_type, DATE(OrderDate) AS event_date,
    COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, SUM(SellingPrice_Inc_GST) AS revenue
  FROM `frido-429506.production.fact_all_platform_sales_report`
  WHERE Channel = 'Shopify' AND OrderDate IS NOT NULL
  GROUP BY 2
)

SELECT record_type, event_date, event_ts,
  ticket_id, source, channel, group_name, association_type, status, ticket_type, agent_name,
  disposition, sub_category, sub_category_2, customer_key,
  is_interaction, is_task, is_escalation, is_customer_initiated, is_resolved,
  resolved_ts, ttr_hours, resolution_time_hrs, first_reply_ts, first_agent_reply_ts,
  frt_bh_seconds, agent_frt_bh_seconds,
  CAST(NULL AS STRING) AS call_id, CAST(NULL AS STRING) AS caller_id, CAST(NULL AS STRING) AS campaign_name, CAST(NULL AS STRING) AS call_type,
  CAST(NULL AS BOOL) AS is_answered, CAST(NULL AS BOOL) AS is_cs_inbound,
  CAST(NULL AS INT64) AS time_to_answer_s, CAST(NULL AS INT64) AS handling_s, CAST(NULL AS INT64) AS wrapup_s,
  CAST(NULL AS FLOAT64) AS login_hours,
  CAST(NULL AS INT64) AS orders, CAST(NULL AS NUMERIC) AS units, CAST(NULL AS FLOAT64) AS revenue,
  replying_agent_ids,
  CURRENT_TIMESTAMP() AS refreshed_at
FROM ticket_rows

UNION ALL
SELECT record_type, event_date, event_ts,
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
  CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL),
  CAST(NULL AS DATETIME), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), CAST(NULL AS DATETIME), CAST(NULL AS DATETIME),
  CAST(NULL AS INT64), CAST(NULL AS INT64),
  call_id, caller_id, campaign_name, call_type, is_answered, is_cs_inbound, time_to_answer_s, handling_s, wrapup_s,
  CAST(NULL AS FLOAT64), CAST(NULL AS INT64), CAST(NULL AS NUMERIC), CAST(NULL AS FLOAT64),
  CAST(NULL AS ARRAY<STRING>),
  CURRENT_TIMESTAMP()
FROM call_out

UNION ALL
SELECT record_type, event_date, CAST(NULL AS DATETIME),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), agent_name,
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
  CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL),
  CAST(NULL AS DATETIME), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), CAST(NULL AS DATETIME), CAST(NULL AS DATETIME),
  CAST(NULL AS INT64), CAST(NULL AS INT64),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS BOOL), CAST(NULL AS BOOL),
  CAST(NULL AS INT64), CAST(NULL AS INT64), CAST(NULL AS INT64),
  login_hours, CAST(NULL AS INT64), CAST(NULL AS NUMERIC), CAST(NULL AS FLOAT64),
  CAST(NULL AS ARRAY<STRING>),
  CURRENT_TIMESTAMP()
FROM agent_out

UNION ALL
SELECT record_type, event_date, CAST(NULL AS DATETIME),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
  CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS BOOL),
  CAST(NULL AS DATETIME), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), CAST(NULL AS DATETIME), CAST(NULL AS DATETIME),
  CAST(NULL AS INT64), CAST(NULL AS INT64),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS BOOL), CAST(NULL AS BOOL),
  CAST(NULL AS INT64), CAST(NULL AS INT64), CAST(NULL AS INT64),
  CAST(NULL AS FLOAT64), orders, CAST(units AS NUMERIC), CAST(revenue AS FLOAT64),
  CAST(NULL AS ARRAY<STRING>),
  CURRENT_TIMESTAMP()
FROM order_out
