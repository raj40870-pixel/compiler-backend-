FROM ubuntu:22.04

# Avoid prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, npm, and all required compilers
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    python3 \
    openjdk-17-jdk \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY backend/ .

# Build TypeScript code
RUN npm run build

# Expose port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
