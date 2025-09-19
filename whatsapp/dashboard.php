<?php
/**
 * Dashboard para gerenciar números do WhatsApp
 */

// Arquivos de configuração
$numbersFile = 'numbers.json';
$stateFile = 'whatsapp_state.txt';

/**
 * Função para ler os números do arquivo JSON
 */
function readNumbers($numbersFile) {
    if (!file_exists($numbersFile)) {
        return [];
    }
    
    $content = file_get_contents($numbersFile);
    $numbers = json_decode($content, true);
    
    return is_array($numbers) ? $numbers : [];
}

/**
 * Função para salvar os números no arquivo JSON
 */
function saveNumbers($numbersFile, $numbers) {
    $json = json_encode($numbers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    return file_put_contents($numbersFile, $json) !== false;
}

/**
 * Função para ler o estado atual
 */
function readState($stateFile) {
    if (!file_exists($stateFile)) {
        return 0;
    }
    
    $content = file_get_contents($stateFile);
    return intval(trim($content));
}

// Processar adição de novo número
if ($_POST && isset($_POST['action']) && $_POST['action'] === 'add_number') {
    $newNumber = trim($_POST['number']);
    
    if (!empty($newNumber)) {
        $numbers = readNumbers($numbersFile);
        
        // Verifica se o número já existe
        $exists = false;
        foreach ($numbers as $num) {
            if ($num['number'] === $newNumber) {
                $exists = true;
                break;
            }
        }
        
        if (!$exists) {
            // Adiciona o novo número com count 0
            $numbers[] = [
                'number' => $newNumber,
                'count' => 0
            ];
            
            if (saveNumbers($numbersFile, $numbers)) {
                $successMessage = "Número adicionado com sucesso!";
            } else {
                $errorMessage = "Erro ao salvar o número.";
            }
        } else {
            $errorMessage = "Este número já existe na lista.";
        }
    } else {
        $errorMessage = "Por favor, insira um número válido.";
    }
}

// Ler dados atuais
$numbers = readNumbers($numbersFile);
$currentState = readState($stateFile);
$nextIndex = $currentState;
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard WhatsApp - Gerenciador de Números</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 4px solid #25D366;
        }
        
        .stat-card h3 {
            color: #25D366;
            font-size: 2em;
            margin-bottom: 10px;
        }
        
        .stat-card p {
            color: #666;
            font-size: 1.1em;
        }
        
        .content {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 30px;
        }
        
        .table-section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .form-section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .section-title {
            color: #25D366;
            font-size: 1.5em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        
        th {
            background-color: #f8f9fa;
            color: #25D366;
            font-weight: 600;
        }
        
        tr:hover {
            background-color: #f8f9fa;
        }
        
        .next-number {
            background-color: #e8f5e8 !important;
            font-weight: bold;
            color: #25D366;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        
        input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input[type="text"]:focus {
            outline: none;
            border-color: #25D366;
        }
        
        .btn {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
            width: 100%;
        }
        
        .btn:hover {
            transform: translateY(-2px);
        }
        
        .alert {
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        
        .alert-success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert-error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        .empty-state i {
            font-size: 3em;
            color: #ddd;
            margin-bottom: 20px;
        }
        
        @media (max-width: 768px) {
            .content {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .stats {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📱 Dashboard WhatsApp</h1>
            <p>Gerenciador de Números e Redirecionamentos</p>
        </div>
        
        <?php if (isset($successMessage)): ?>
            <div class="alert alert-success">
                <?php echo htmlspecialchars($successMessage); ?>
            </div>
        <?php endif; ?>
        
        <?php if (isset($errorMessage)): ?>
            <div class="alert alert-error">
                <?php echo htmlspecialchars($errorMessage); ?>
            </div>
        <?php endif; ?>
        
        <div class="stats">
            <div class="stat-card">
                <h3><?php echo count($numbers); ?></h3>
                <p>Números Cadastrados</p>
            </div>
            <div class="stat-card">
                <h3><?php echo array_sum(array_column($numbers, 'count')); ?></h3>
                <p>Total de Redirecionamentos</p>
            </div>
            <div class="stat-card">
                <h3><?php echo !empty($numbers) ? $numbers[$nextIndex]['number'] : 'N/A'; ?></h3>
                <p>Próximo Número</p>
            </div>
        </div>
        
        <div class="content">
            <div class="table-section">
                <h2 class="section-title">📊 Lista de Números</h2>
                
                <?php if (empty($numbers)): ?>
                    <div class="empty-state">
                        <div>📱</div>
                        <h3>Nenhum número cadastrado</h3>
                        <p>Adicione o primeiro número usando o formulário ao lado.</p>
                    </div>
                <?php else: ?>
                    <table>
                        <thead>
                            <tr>
                                <th>Número</th>
                                <th>Total de Redirecionamentos</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($numbers as $index => $number): ?>
                                <tr class="<?php echo $index === $nextIndex ? 'next-number' : ''; ?>">
                                    <td><?php echo htmlspecialchars($number['number']); ?></td>
                                    <td><?php echo number_format($number['count']); ?></td>
                                    <td>
                                        <?php if ($index === $nextIndex): ?>
                                            <span style="color: #25D366; font-weight: bold;">🔄 Próximo</span>
                                        <?php else: ?>
                                            <span style="color: #666;">⏳ Aguardando</span>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
            
            <div class="form-section">
                <h2 class="section-title">➕ Adicionar Número</h2>
                
                <form method="POST" action="">
                    <input type="hidden" name="action" value="add_number">
                    
                    <div class="form-group">
                        <label for="number">Número do WhatsApp:</label>
                        <input 
                            type="text" 
                            id="number" 
                            name="number" 
                            placeholder="Ex: 5511999999999" 
                            required
                            pattern="[0-9]+"
                            title="Digite apenas números (formato internacional)"
                        >
                        <small style="color: #666; font-size: 0.9em; margin-top: 5px; display: block;">
                            Formato: código do país + DDD + número (sem espaços ou símbolos)
                        </small>
                    </div>
                    
                    <button type="submit" class="btn">
                        ➕ Adicionar Número
                    </button>
                </form>
                
                <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
                    <h4 style="color: #25D366; margin-bottom: 10px;">ℹ️ Como funciona:</h4>
                    <ul style="color: #666; line-height: 1.8;">
                        <li>Os números são alternados automaticamente</li>
                        <li>Cada visita incrementa o contador</li>
                        <li>O próximo número é indicado na tabela</li>
                        <li>Novos números começam com contador 0</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Auto-refresh da página a cada 30 segundos para mostrar dados atualizados
        setTimeout(function() {
            location.reload();
        }, 30000);
        
        // Formatação do input de número
        document.getElementById('number').addEventListener('input', function(e) {
            // Remove caracteres não numéricos
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    </script>
</body>
</html>
