#!/bin/bash

echo "🚀 Instalando Google Sheets Tracker..."
echo "======================================"

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Por favor, instale o Node.js primeiro."
    echo "   Visite: https://nodejs.org/"
    exit 1
fi

# Verificar versão do Node.js
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js versão 16 ou superior é necessária. Versão atual: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) encontrado"

# Verificar se o npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado. Por favor, instale o npm primeiro."
    exit 1
fi

echo "✅ npm $(npm -v) encontrado"

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependências instaladas com sucesso"
else
    echo "❌ Erro ao instalar dependências"
    exit 1
fi

# Verificar se o arquivo de chave existe
if [ ! -f "service-account-key.json" ]; then
    echo "⚠️  ATENÇÃO: Arquivo service-account-key.json não encontrado!"
    echo "   Você precisa configurar a autenticação do Google Sheets."
    echo "   Consulte o README para instruções detalhadas."
else
    echo "✅ Arquivo de autenticação encontrado"
fi

echo ""
echo "🎯 Instalação concluída!"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure o arquivo service-account-key.json com suas credenciais"
echo "2. Compartilhe sua planilha com a conta de serviço"
echo "3. Execute: npm start"
echo ""
echo "🔗 Endpoints disponíveis:"
echo "   POST http://localhost:3001/registrar-evento"
echo "   POST http://localhost:3001/registrar-purchase"
echo "   GET  http://localhost:3001/status"
echo ""
echo "📖 Para mais informações, consulte o README-SHEETS-TRACKER.md"
echo ""
echo "🚀 Para testar, execute: node test-sheets-tracker.js"