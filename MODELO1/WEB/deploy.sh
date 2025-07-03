#!/bin/bash

# Script de deploy para o Token Manager
# Uso: ./deploy.sh [comando]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️ $1${NC}"
}

# Verificar se Docker está instalado
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker não está instalado!"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose não está instalado!"
        exit 1
    fi
}

# Criar diretórios necessários
setup_directories() {
    log "Criando diretórios necessários..."
    mkdir -p logs data ssl
    success "Diretórios criados"
}

# Verificar configurações
check_config() {
    log "Verificando configurações..."
    
    if [ ! -f ".env" ]; then
        warning "Arquivo .env não encontrado, criando a partir do .env.example"
        cp .env.example .env
        warning "⚠️ Edite o arquivo .env com suas configurações!"
    fi
    
    # Verificar se package.json existe
    if [ ! -f "package.json" ]; then
        error "package.json não encontrado!"
        exit 1
    fi
    
    # Verificar se server.js existe
    if [ ! -f "server.js" ]; then
        error "server.js não encontrado!"
        exit 1
    fi
    
    success "Configurações verificadas"
}

# Build das imagens
build() {
    log "Construindo imagens Docker..."
    docker-compose build --no-cache
    success "Imagens construídas"
}

# Deploy completo
deploy() {
    log "Iniciando deploy..."
    
    check_docker
    setup_directories
    check_config
    
    # Parar serviços existentes
    log "Parando serviços existentes..."
    docker-compose down || true
    
    # Build das imagens
    build
    
    # Iniciar serviços
    log "Iniciando serviços..."
    docker-compose up -d
    
    # Aguardar serviços ficarem prontos
    log "Aguardando serviços ficarem prontos..."
    sleep 10
    
    # Verificar se os serviços estão rodando
    if docker-compose ps | grep -q "Up"; then
        success "Deploy concluído com sucesso!"
        log "Serviços disponíveis:"
        echo "  - App: http://localhost:3000"
        echo "  - Admin: http://localhost:3000/admin.html"
        echo "  - Health: http://localhost:3000/api/health"
        echo "  - Nginx: http://localhost:80"
    else
        error "Falha ao iniciar serviços!"
        log "Logs dos serviços:"
        docker-compose logs
        exit 1
    fi
}

# Parar serviços
stop() {
    log "Parando serviços..."
    docker-compose down
    success "Serviços parados"
}

# Reiniciar serviços
restart() {
    log "Reiniciando serviços..."
    docker-compose restart
    success "Serviços reiniciados"
}

# Ver logs
logs() {
    log "Mostrando logs dos serviços..."
    docker-compose logs -f
}

# Status dos serviços
status() {
    log "Status dos serviços:"
    docker-compose ps
    
    echo
    log "Uso de recursos:"
    docker stats --no-stream
}

# Limpar containers e imagens antigas
clean() {
    log "Limpando containers e imagens antigas..."
    
    # Parar todos os containers
    docker-compose down
    
    # Remover containers parados
    docker container prune -f
    
    # Remover imagens não utilizadas
    docker image prune -f
    
    # Remover volumes não utilizados
    docker volume prune -f
    
    success "Limpeza concluída"
}

# Backup dos dados
backup() {
    log "Criando backup dos dados..."
    
    BACKUP_DIR="backups/$(date +'%Y%m%d_%H%M%S')"
    mkdir -p "$BACKUP_DIR"
    
    # Backup do banco de dados (se existir)
    if [ -d "data" ]; then
        cp -r data "$BACKUP_DIR/"
        success "Backup dos dados criado em $BACKUP_DIR"
    else
        warning "Diretório 'data' não encontrado"
    fi
    
    # Backup das configurações
    if [ -f ".env" ]; then
        cp .env "$BACKUP_DIR/"
    fi
    
    success "Backup concluído em $BACKUP_DIR"
}

# Atualizar aplicação
update() {
    log "Atualizando aplicação..."
    
    # Fazer backup antes da atualização
    backup
    
    # Parar serviços
    docker-compose down
    
    # Atualizar código (assumindo que está em um repositório git)
    if [ -d ".git" ]; then
        log "Atualizando código do repositório..."
        git pull origin main || git pull origin master
    fi
    
    # Rebuild e restart
    build
    docker-compose up -d
    
    success "Atualização concluída"
}

# Instalar dependências
install() {
    log "Instalando dependências..."
    
    # Verificar se npm está instalado
    if command -v npm &> /dev/null; then
        npm install
        success "Dependências instaladas"
    else
        warning "npm não encontrado, pulando instalação de dependências"
    fi
}

# Configurar SSL (Let's Encrypt)
setup_ssl() {
    log "Configurando SSL com Let's Encrypt..."
    
    if [ -z "$1" ]; then
        error "Uso: $0 ssl <seu-dominio.com>"
        exit 1
    fi
    
    DOMAIN=$1
    
    # Verificar se certbot está instalado
    if ! command -v certbot &> /dev/null; then
        error "Certbot não está instalado!"
        log "Instale com: sudo apt-get install certbot python3-certbot-nginx"
        exit 1
    fi
    
    # Gerar certificado
    certbot certonly --nginx -d "$DOMAIN"
    
    success "SSL configurado para $DOMAIN"
}

# Monitoramento básico
monitor() {
    log "Iniciando monitoramento..."
    
    while true; do
        clear
        echo "=== Token Manager - Monitor ==="
        echo "Pressione Ctrl+C para sair"
        echo
        
        # Status dos containers
        echo "📊 Status dos Containers:"
        docker-compose ps
        echo
        
        # Uso de recursos
        echo "💻 Uso de Recursos:"
        docker stats --no-stream
        echo
        
        # Logs recentes
        echo "📝 Logs Recentes:"
        docker-compose logs --tail=10
        
        sleep 30
    done
}

# Ajuda
help() {
    echo "Token Manager - Script de Deploy"
    echo
    echo "Uso: $0 [comando]"
    echo
    echo "Comandos disponíveis:"
    echo "  deploy       - Deploy completo da aplicação"
    echo "  build        - Construir imagens Docker"
    echo "  start        - Iniciar serviços"
    echo "  stop         - Parar serviços"
    echo "  restart      - Reiniciar serviços"
    echo "  logs         - Ver logs dos serviços"
    echo "  status       - Status dos serviços"
    echo "  clean        - Limpar containers e imagens antigas"
    echo "  backup       - Fazer backup dos dados"
    echo "  update       - Atualizar aplicação"
    echo "  install      - Instalar dependências"
    echo "  ssl <domain> - Configurar SSL para domínio"
    echo "  monitor      - Monitoramento em tempo real"
    echo "  help         - Mostrar esta ajuda"
    echo
}

# Comando principal
case "$1" in
    deploy)
        deploy
        ;;
    build)
        build
        ;;
    start)
        check_docker
        docker-compose up -d
        success "Serviços iniciados"
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    clean)
        clean
        ;;
    backup)
        backup
        ;;
    update)
        update
        ;;
    install)
        install
        ;;
    ssl)
        setup_ssl "$2"
        ;;
    monitor)
        monitor
        ;;
    help|--help|-h)
        help
        ;;
    *)
        if [ -z "$1" ]; then
            # Se nenhum comando for especificado, fazer deploy
            deploy
        else
            error "Comando '$1' não reconhecido"
            help
            exit 1
        fi
        ;;
esac