const sqlite = require('./database/sqlite');

console.log('🧪 TESTE DA CORREÇÃO SQLITE');
console.log('============================\n');

// 1. Testar get() sem inicializar
console.log('1️⃣ Testando sqlite.get() sem inicializar...');
let db1 = sqlite.get();
console.log('   - db1 exists:', !!db1);
console.log('   - db1 type:', typeof db1);

// 2. Inicializar SQLite
console.log('\n2️⃣ Inicializando SQLite...');
const initResult = sqlite.initialize('./pagamentos.db');
console.log('   - Initialize result:', !!initResult);

// 3. Testar get() após inicializar
console.log('\n3️⃣ Testando sqlite.get() após inicializar...');
let db2 = sqlite.get();
console.log('   - db2 exists:', !!db2);
console.log('   - db2 type:', typeof db2);

// 4. Testar se db2 tem métodos necessários
if (db2) {
  console.log('\n4️⃣ Testando métodos do db2...');
  console.log('   - db2.get exists:', typeof db2.get);
  console.log('   - db2.prepare exists:', typeof db2.prepare);
  console.log('   - db2.run exists:', typeof db2.run);
  console.log('   - db2 constructor:', db2.constructor.name);
  
  // 5. Testar query simples
  try {
    console.log('\n5️⃣ Testando query simples...');
    const testQuery = db2.prepare('SELECT COUNT(*) as count FROM tokens');
    const result = testQuery.get();
    console.log('   - Query result:', result);
    console.log('   - ✅ SQLite funcionando perfeitamente!');
  } catch (error) {
    console.error('   - ❌ Erro na query:', error.message);
  }
} else {
  console.error('\n❌ db2 é null - correção não funcionou');
}

console.log('\n🎯 RESULTADO:');
if (db2 && typeof db2.prepare === 'function') {
  console.log('✅ CORREÇÃO FUNCIONA! sqlite.get() retorna instância válida do better-sqlite3');
} else {
  console.error('❌ CORREÇÃO FALHOU! sqlite.get() ainda retorna null');
}
