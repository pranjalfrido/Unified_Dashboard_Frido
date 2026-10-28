FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# No credentials are baked into the image. BigQuery credentials come at runtime from either
#   GCP_SA_KEY       (the JSON itself, from a Secret Manager secret exposed as an env var), or
#   GCP_SA_KEY_FILE  (path to a Secret Manager secret mounted as a file, e.g. /secrets/pulse_readonly_key.json)
EXPOSE 8080
CMD ["node", "server.js"]
