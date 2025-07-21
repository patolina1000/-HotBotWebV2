<?php
// Encurtador de Link - ohvips.xyz/seusonho
// Redireciona para: https://entry.ohvips.xyz/?utm_source=instagram&utm_medium=bio&utm_campaign=bio-instagram

// URL de destino
$destino_url = "https://entry.ohvips.xyz/?utm_source=instagram&utm_medium=bio&utm_campaign=bio-instagram";

// Redireciona o usuário com código HTTP 301 (redirecionamento permanente)
header("Location: " . $destino_url, true, 301);

// Encerra a execução do script para garantir o redirecionamento
exit();
?>