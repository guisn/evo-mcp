# Use Node.js 18.16.0 to match your local environment
FROM node:18.16.0

# Set working directory inside the container
WORKDIR /app

# Copy package.json to install dependencies
COPY package.json ./

# Install dependencies
RUN npm install

# Install TypeScript globally (optional)
RUN npm install -g typescript

# Install supergateway globally
RUN npm install -g supergateway

# Copy the rest of your application files
COPY . .

# Expose the port (optional, for documentation)
EXPOSE 8000

# Command to run Supergateway with configurable baseUrl
CMD ["sh", "-c", "npx -y supergateway --stdio 'node index.js' --port 8000 --baseUrl ${GATEWAY_BASE_URL:-http://localhost:8000}"]
