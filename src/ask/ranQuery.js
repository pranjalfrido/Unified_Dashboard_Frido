// "Show SQL" is only for answers that really ran a query. The connector reports the SQL it ran, or just a tool
// name ('oos_loss', 'pnl', 'dashboard_api …') when the answer came from a built-in page calculation: those are
// not queries, so nothing is offered for them.
export const ranQuery = sql => typeof sql === 'string' && sql.length > 20 && /\b(select|with)\b[\s\S]*\bfrom\b/i.test(sql)
