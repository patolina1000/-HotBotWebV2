<?php
/**
 * Redirecionador alternado para WhatsApp
 * Alterna entre números a cada visita usando numbers.json
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
        return 0; // Primeira visita
    }
    
    $content = file_get_contents($stateFile);
    return intval(trim($content));
}

/**
 * Função para escrever o novo estado
 */
function writeState($stateFile, $newState) {
    // Cria o arquivo se não existir
    if (!file_exists($stateFile)) {
        touch($stateFile);
    }
    
    // Abre o arquivo com lock exclusivo para evitar acesso simultâneo
    $handle = fopen($stateFile, 'c+');
    
    if ($handle === false) {
        error_log('Erro ao abrir arquivo de estado');
        return false;
    }
    
    // Tenta obter lock exclusivo (bloqueia até conseguir)
    if (flock($handle, LOCK_EX)) {
        // Escreve o novo estado
        ftruncate($handle, 0); // Limpa o arquivo
        fwrite($handle, $newState);
        fflush($handle); // Força a escrita no disco
        
        // Libera o lock
        flock($handle, LOCK_UN);
        fclose($handle);
        
        return true;
    } else {
        fclose($handle);
        error_log('Erro ao obter lock do arquivo');
        return false;
    }
}

/**
 * Função para alternar o estado
 */
function toggleState($currentState, $maxIndex) {
    return ($currentState + 1) % ($maxIndex + 1);
}

/**
 * Função principal de redirecionamento
 */
function redirectToWhatsApp($numbersFile, $stateFile) {
    // Lê os números do arquivo JSON
    $numbers = readNumbers($numbersFile);
    
    if (empty($numbers)) {
        error_log('Nenhum número encontrado no arquivo JSON');
        header("Location: https://wa.me/5511999999999"); // Fallback
        exit();
    }
    
    $maxIndex = count($numbers) - 1;
    
    // Lê o estado atual
    $currentState = readState($stateFile);
    
    // Calcula o próximo estado
    $nextState = toggleState($currentState, $maxIndex);
    
    // Escreve o novo estado
    if (writeState($stateFile, $nextState)) {
        // Seleciona o número baseado no estado atual (antes da mudança)
        $selectedNumber = $numbers[$currentState]['number'];
        
        // Incrementa o contador do número selecionado
        $numbers[$currentState]['count']++;
        
        // Salva os números atualizados
        saveNumbers($numbersFile, $numbers);
        
        // Constrói a URL do WhatsApp
        $whatsappUrl = "https://wa.me/{$selectedNumber}";
        
        // Redireciona
        header("Location: {$whatsappUrl}");
        exit();
    } else {
        // Fallback em caso de erro
        error_log('Erro ao escrever estado, usando número padrão');
        $defaultNumber = $numbers[0]['number'];
        $whatsappUrl = "https://wa.me/{$defaultNumber}";
        header("Location: {$whatsappUrl}");
        exit();
    }
}

// Executa o redirecionamento
redirectToWhatsApp($numbersFile, $stateFile);
?>
