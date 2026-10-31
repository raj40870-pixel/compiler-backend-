FROM ubuntu:22.04

# Avoid prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, npm, and all required compilers
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    ca-certificates \
    build-essential \
    gcc \
    g++ \
    python3 \
    openjdk-17-jdk \
    golang-go \
    php-cli \
    rustc \
    cargo \
    lua5.4 \
    ruby \
    unzip \
    && ln -s /usr/bin/lua5.4 /usr/bin/lua || true \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g typescript ts-node \
    && wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y dotnet-sdk-8.0 \
    && curl -L https://github.com/JetBrains/kotlin/releases/download/v2.1.0/kotlin-compiler-2.1.0.zip -o /tmp/kotlin.zip \
    && unzip /tmp/kotlin.zip -d /opt \
    && rm /tmp/kotlin.zip \
    && ln -s /opt/kotlinc/bin/kotlinc /usr/local/bin/kotlinc \
    && ln -s /opt/kotlinc/bin/kotlin /usr/local/bin/kotlin \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Environment configuration for fast, silent execution of .NET and Kotlin
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
    DOTNET_GENERATE_ASPNET_CERTIFICATE=0 \
    JAVA_OPTS="-Xmx384m -Xms64m -XX:+TieredCompilation -XX:TieredStopAtLevel=1"

# Pre-warm .NET SDK, NuGet caches, and Kotlin compiler
RUN dotnet new console -o /tmp/warmup-cs \
    && cd /tmp/warmup-cs \
    && dotnet build -c Release \
    && cd / \
    && rm -rf /tmp/warmup-cs \
    && echo 'fun main() { println("warm") }' > /tmp/warm.kt \
    && kotlinc /tmp/warm.kt -J-Xmx384m -J-XX:+TieredCompilation -J-XX:TieredStopAtLevel=1 -d /tmp/warm.jar \
    && rm -rf /tmp/warm* \
    && chmod -R 777 /tmp

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build \
    && mkdir -p /app/bin/runs \
    && chmod -R 777 /app/bin

# Expose port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
