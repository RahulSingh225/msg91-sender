FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy app
COPY . .

ENV NODE_ENV=production

# Default command (overridden in compose for each service)
CMD ["node", "webhook.js"]
