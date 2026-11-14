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
    perl \
    r-base \
    scala \
    clang \
    libicu-dev \
    libcurl4 \
    libxml2 \
    libz3-dev \
    libpython3.10 \
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
    && curl -fsSL https://storage.googleapis.com/dart-archive/channels/stable/release/latest/sdk/dartsdk-linux-x64-release.zip -o /tmp/dart.zip \
    && unzip /tmp/dart.zip -d /opt \
    && rm /tmp/dart.zip \
    && ln -s /opt/dart-sdk/bin/dart /usr/local/bin/dart \
    && curl -fsSL https://julialang-s3.julialang.org/bin/linux/x64/1.10/julia-1.10.5-linux-x86_64.tar.gz -o /tmp/julia.tar.gz \
    && tar -xzf /tmp/julia.tar.gz -C /opt \
    && rm /tmp/julia.tar.gz \
    && ln -s /opt/julia-1.10.5/bin/julia /usr/local/bin/julia \
    && curl -fsSL https://download.swift.org/swift-5.10.1-release/ubuntu2204/swift-5.10.1-RELEASE/swift-5.10.1-RELEASE-ubuntu22.04.tar.gz -o /tmp/swift.tar.gz \
    && tar -xzf /tmp/swift.tar.gz -C /opt \
    && rm /tmp/swift.tar.gz \
    && ln -s /opt/swift-5.10.1-RELEASE-ubuntu22.04/usr/bin/swift /usr/local/bin/swift \
    && ln -s /opt/swift-5.10.1-RELEASE-ubuntu22.04/usr/bin/swiftc /usr/local/bin/swiftc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Environment configuration for fast, silent execution of .NET, Kotlin, and Swift
ENV PATH="/opt/swift-5.10.1-RELEASE-ubuntu22.04/usr/bin:${PATH}" \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
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
    && echo 'void main() => print("warm");' > /tmp/warm.dart \
    && dart run /tmp/warm.dart \
    && Rscript -e 'cat("warm\n")' \
    && perl -e 'print "warm\n"' \
    && (echo 'object Main extends App { println("warm") }' > /tmp/warm.scala && scala /tmp/warm.scala || true) \
    && (echo 'println("warm")' > /tmp/warm.jl && julia /tmp/warm.jl || true) \
    && (echo 'print("warm")' > /tmp/warm.swift && swift /tmp/warm.swift || true) \
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
