#!/usr/bin/env node

/**
 * Script para padronizar a coluna 'valor' na tabela tokens
 * 
 * PROBLEMA: A coluna 'valor' armazena valores mistos em reais e centavos
 * SOLUÇÃO: Padronizar tudo para centavos (padrão do sistema)
 * 
 * USO:
 *   node fix-tokens-valor-column.js --dry-run  # Apenas simular
 *   node fix-tokens-valor-column.js --apply    # Aplicar correções
 */

const { Pool } = require('pg');
const sqlite = require('better-sqlite3');

// Configurações
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY_CHANGES = process.argv.includes('--apply');

if (!DRY_RUN && !APPLY_CHANGES) {
  console.log('❌ Especifique --dry-run para simular ou --apply para aplicar as correções');
  process.exit(1);
}

/**
 * Detecta se um valor está em centavos usando heurística melhorada
 */
function isValueInCents(valor) {
  if (valor >= 5000) {
    return true; // Provavelmente centavos (R$ 50+)
  }
  
  // Verificar casas decimais
  const decimalPlaces = (valor.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    return false; // Mais de 2 decimais = provavelmente reais
  }
  
  // Valores baixos assumir como reais por segurança
  return false;
}

/**
 * Converte valor para centavos se necessário
 */
function normalizeToCents(valor) {
  if (isValueInCents(valor)) {
    return Math.round(valor); // Já em centavos, apenas arredondar
  }
  return Math.round(valor * 100); // Converter de reais para centavos
}

/**
 * Processa tabela PostgreSQL
 */
async function processPostgreSQL() {
  if (!process.env.DATABASE_URL) {
    console.log('⚠️ DATABASE_URL não configurada, pulando PostgreSQL');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Analisando tabela tokens no PostgreSQL...');
    
    // Buscar todos os registros com valor não nulo
    const result = await pool.query(`
      SELECT id_transacao, valor, token, criado_em, status
      FROM tokens 
      WHERE valor IS NOT NULL AND valor > 0
      ORDER BY criado_em DESC
    `);
    
    const rows = result.rows;
    console.log(`📊 Encontrados ${rows.length} registros com valor`);
    
    let needsUpdate = 0;
    let alreadyCorrect = 0;
    const updates = [];
    
    for (const row of rows) {
      const currentValue = parseFloat(row.valor);
      const normalizedValue = normalizeToCents(currentValue);
      
      if (Math.abs(currentValue - normalizedValue) > 0.01) {
        needsUpdate++;
        updates.push({
          id_transacao: row.id_transacao,
          valor_atual: currentValue,
          valor_corrigido: normalizedValue,
          diferenca: normalizedValue - currentValue,
          em_centavos: isValueInCents(currentValue)
        });
        
        if (updates.length <= 10) { // Mostrar apenas primeiros 10
          console.log(`🔧 ${row.id_transacao}: ${currentValue} → ${normalizedValue} (${isValueInCents(currentValue) ? 'já centavos' : 'reais→centavos'})`);
        }
      } else {
        alreadyCorrect++;
      }
    }
    
    console.log(`\n📈 Resumo PostgreSQL:`);
    console.log(`  ✅ Já corretos: ${alreadyCorrect}`);
    console.log(`  🔧 Precisam correção: ${needsUpdate}`);
    
    if (needsUpdate > 10) {
      console.log(`  ... e mais ${needsUpdate - 10} registros`);
    }
    
    if (APPLY_CHANGES && needsUpdate > 0) {
      console.log('\n🚀 Aplicando correções no PostgreSQL...');
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        for (const update of updates) {
          await client.query(
            'UPDATE tokens SET valor = $1 WHERE id_transacao = $2',
            [update.valor_corrigido, update.id_transacao]
          );
        }
        
        await client.query('COMMIT');
        console.log(`✅ ${needsUpdate} registros atualizados no PostgreSQL`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    
  } catch (error) {
    console.error('❌ Erro no PostgreSQL:', error.message);
  } finally {
    await pool.end();
  }
}

/**
 * Processa banco SQLite
 */
async function processSQLite() {
  const dbPath = './pagamentos.db';
  
  try {
    const db = sqlite(dbPath);
    
    console.log('\n🔍 Analisando tabela tokens no SQLite...');
    
    // Buscar todos os registros com valor não nulo
    const rows = db.prepare(`
      SELECT id_transacao, valor, token, criado_em, status
      FROM tokens 
      WHERE valor IS NOT NULL AND valor > 0
      ORDER BY criado_em DESC
    `).all();
    
    console.log(`📊 Encontrados ${rows.length} registros com valor`);
    
    let needsUpdate = 0;
    let alreadyCorrect = 0;
    const updates = [];
    
    for (const row of rows) {
      const currentValue = parseFloat(row.valor);
      const normalizedValue = normalizeToCents(currentValue);
      
      if (Math.abs(currentValue - normalizedValue) > 0.01) {
        needsUpdate++;
        updates.push({
          id_transacao: row.id_transacao,
          valor_atual: currentValue,
          valor_corrigido: normalizedValue,
          diferenca: normalizedValue - currentValue,
          em_centavos: isValueInCents(currentValue)
        });
        
        if (updates.length <= 10) { // Mostrar apenas primeiros 10
          console.log(`🔧 ${row.id_transacao}: ${currentValue} → ${normalizedValue} (${isValueInCents(currentValue) ? 'já centavos' : 'reais→centavos'})`);
        }
      } else {
        alreadyCorrect++;
      }
    }
    
    console.log(`\n📈 Resumo SQLite:`);
    console.log(`  ✅ Já corretos: ${alreadyCorrect}`);
    console.log(`  🔧 Precisam correção: ${needsUpdate}`);
    
    if (needsUpdate > 10) {
      console.log(`  ... e mais ${needsUpdate - 10} registros`);
    }
    
    if (APPLY_CHANGES && needsUpdate > 0) {
      console.log('\n🚀 Aplicando correções no SQLite...');
      
      const updateStmt = db.prepare('UPDATE tokens SET valor = ? WHERE id_transacao = ?');
      
      db.transaction(() => {
        for (const update of updates) {
          updateStmt.run(update.valor_corrigido, update.id_transacao);
        }
      })();
      
      console.log(`✅ ${needsUpdate} registros atualizados no SQLite`);
    }
    
    db.close();
    
  } catch (error) {
    if (error.code === 'SQLITE_CANTOPEN') {
      console.log('⚠️ Arquivo SQLite não encontrado, pulando...');
    } else {
      console.error('❌ Erro no SQLite:', error.message);
    }
  }
}

/**
 * Criar script SQL para adicionar índices e melhorar estrutura
 */
function generateSQLImprovements() {
  const sql = `
-- Script para melhorar estrutura da tabela tokens
-- Executar manualmente no PostgreSQL

-- 1. Adicionar índice composto para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_tokens_status_usado ON tokens(status, usado);

-- 2. Adicionar índice para telegram_id (muito usado em JOINs)
CREATE INDEX IF NOT EXISTS idx_tokens_telegram_id ON tokens(telegram_id);

-- 3. Adicionar índice para criado_em (usado em ordenações)
CREATE INDEX IF NOT EXISTS idx_tokens_criado_em ON tokens(criado_em);

-- 4. Adicionar constraint para garantir valores positivos
ALTER TABLE tokens ADD CONSTRAINT check_valor_positive CHECK (valor IS NULL OR valor >= 0);

-- 5. Adicionar comentário na coluna para documentar unidade
COMMENT ON COLUMN tokens.valor IS 'Valor em centavos (padrão do sistema)';

-- 6. Estatísticas para verificar distribuição de valores
SELECT 
  COUNT(*) as total_registros,
  COUNT(CASE WHEN valor IS NOT NULL THEN 1 END) as com_valor,
  MIN(valor) as valor_minimo,
  MAX(valor) as valor_maximo,
  AVG(valor) as valor_medio,
  COUNT(CASE WHEN valor >= 5000 THEN 1 END) as provavelmente_centavos,
  COUNT(CASE WHEN valor < 5000 AND valor > 0 THEN 1 END) as provavelmente_reais
FROM tokens;
`;

  console.log('\n📝 Script SQL para melhorias na estrutura:');
  console.log('=====================================');
  console.log(sql);
  console.log('=====================================\n');
}

/**
 * Função principal
 */
async function main() {
  console.log('🚀 Iniciando padronização da coluna valor...');
  console.log(`📋 Modo: ${DRY_RUN ? 'SIMULAÇÃO' : 'APLICAÇÃO'}`);
  console.log('==========================================\n');
  
  // Processar PostgreSQL
  await processPostgreSQL();
  
  // Processar SQLite
  await processSQLite();
  
  // Gerar melhorias SQL
  if (DRY_RUN) {
    generateSQLImprovements();
  }
  
  console.log('\n✅ Processamento concluído!');
  
  if (DRY_RUN) {
    console.log('\n💡 Para aplicar as correções, execute:');
    console.log('   node fix-tokens-valor-column.js --apply');
  }
}

// Executar
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
