<?php
header("Location: " . ($_ENV['FRONTEND_URL'] ?? $_ENV['BASE_URL'] ?? 'http://localhost:3000') . "/?utm_source=instagram&utm_medium=bio&utm_campaign=bio-instagram");
exit;
?>
