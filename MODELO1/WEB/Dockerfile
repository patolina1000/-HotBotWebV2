FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache \
    curl \
    sqlite \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copiar package.json primeiro (cache Docker)
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p /app/logs /app/data /app/public

# Ajustar permissões
RUN chown -R node:node /app

# Mudar para usuário não-root
USER node

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Comando de start
CMD ["npm", "start"]