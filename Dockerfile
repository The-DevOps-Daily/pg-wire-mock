# PostgreSQL Wire Protocol Mock Server Docker Image
FROM node:16-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose PostgreSQL default port
EXPOSE 5432

# Set non-root user for better security
USER node

# Command to run the application
CMD ["node", "server.js"]
