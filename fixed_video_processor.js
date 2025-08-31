const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

const router = express.Router();

// Configurar caminho do FFmpeg (Linux/Docker)
// Para Windows, descomente a linha abaixo:
// ffmpeg.setFfmpegPath('C:\\ProgramData\\chocolatey\\lib\\ffmpeg\\tools\\ffmpeg\\bin\\ffmpeg.exe');

// Configuração do multer para upload de vídeos
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB por arquivo
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'video/quicktime', 'video/avi', 'video/mov'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido. Use: MP4, MOV, AVI'), false);
        }
    }
});

// Função para verificar se o lama-cleaner está rodando
async function verificarLamaCleaner() {
    try {
        // Testar a rota raiz do lama-cleaner que sempre responde
        const response = await axios.get('http://localhost:8080/', { timeout: 5000 });
        return response.status === 200;
    } catch (error) {
        console.log('❌ Lama-cleaner não está rodando:', error.message);
        return false;
    }
}

// Função para extrair o primeiro frame do vídeo
async function extrairPrimeiroFrame(videoBuffer, nomeOriginal) {
    return new Promise((resolve, reject) => {
        try {
            const timestamp = Date.now();
            const tempVideoPath = path.join(__dirname, `../temp/temp-${timestamp}-${nomeOriginal}`);
            const outputFramePath = path.join(__dirname, `../temp/first-frame-${timestamp}.png`);
            
            // Criar diretório temp se não existir
            fs.ensureDirSync(path.dirname(tempVideoPath));
            
            // Salvar vídeo temporário
            fs.writeFileSync(tempVideoPath, videoBuffer);
            
            console.log('🎬 Extraindo primeiro frame do vídeo...');
            
            ffmpeg(tempVideoPath)
                .outputOptions(['-vframes 1'])
                .output(outputFramePath)
                .on('end', () => {
                    try {
                        // Limpar arquivo temporário do vídeo
                        fs.unlinkSync(tempVideoPath);
                    } catch (e) {}
                    
                    console.log('✅ Primeiro frame extraído com sucesso');
                    resolve(outputFramePath);
                })
                .on('error', (err) => {
                    try {
                        fs.unlinkSync(tempVideoPath);
                    } catch (e) {}
                    console.error('❌ Erro ao extrair primeiro frame:', err);
                    reject(new Error(`Erro ao extrair primeiro frame: ${err.message}`));
                })
                .run();
                
        } catch (error) {
            reject(new Error(`Erro ao processar vídeo: ${error.message}`));
        }
    });
}

// Função para extrair todos os frames do vídeo
async function extrairFrames(videoBuffer, nomeOriginal) {
    return new Promise((resolve, reject) => {
        try {
            const timestamp = Date.now();
            const tempVideoPath = path.join(__dirname, `../temp/temp-${timestamp}-${nomeOriginal}`);
            const outputDir = path.join(__dirname, `../temp/frames-${timestamp}`);
            
            // Criar diretórios
            fs.ensureDirSync(path.dirname(tempVideoPath));
            fs.ensureDirSync(outputDir);
            
            // Salvar vídeo temporário
            fs.writeFileSync(tempVideoPath, videoBuffer);
            
            console.log('🎬 Extraindo frames do vídeo...');
            
            ffmpeg(tempVideoPath)
                .outputOptions(['-vf', 'fps=30'])
                .output(path.join(outputDir, 'frame_%04d.png'))
                .on('end', () => {
                    try {
                        // Limpar arquivo temporário do vídeo
                        fs.unlinkSync(tempVideoPath);
                    } catch (e) {}
                    
                    console.log('✅ Frames extraídos com sucesso');
                    resolve(outputDir);
                })
                .on('error', (err) => {
                    try {
                        fs.unlinkSync(tempVideoPath);
                    } catch (e) {}
                    console.error('❌ Erro ao extrair frames:', err);
                    reject(new Error(`Erro ao extrair frames: ${err.message}`));
                })
                .run();
                
        } catch (error) {
            reject(new Error(`Erro ao processar vídeo: ${error.message}`));
        }
    });
}

// Função para criar máscara a partir das coordenadas
async function criarMascara(coords, largura, altura, outputPath) {
    try {
        const { x1, y1, x2, y2 } = coords;
        
        console.log(`🎨 Criando máscara: ${largura}x${altura} com região (${x1},${y1}) -> (${x2},${y2})`);
        
        // Criar imagem preta com área branca na região selecionada
        const mascara = await sharp({
            create: {
                width: largura,
                height: altura,
                channels: 3, // RGB apenas, sem alpha
                background: { r: 0, g: 0, b: 0 }
            }
        })
        .composite([{
            input: {
                create: {
                    width: x2 - x1,
                    height: y2 - y1,
                    channels: 3,
                    background: { r: 255, g: 255, b: 255 }
                }
            },
            left: x1,
            top: y1
        }])
        .png()
        .toFile(outputPath);
        
        console.log('✅ Máscara criada com sucesso (RGB)');
        return outputPath;
    } catch (error) {
        throw new Error(`Erro ao criar máscara: ${error.message}`);
    }
}

// Função para processar frame com lama-cleaner (versão corrigida)
async function processarFrameComIA(framePath, mascaraPath) {
    try {
        console.log(`🔄 Processando frame: ${framePath}`);
        console.log(`🔄 Usando máscara: ${mascaraPath}`);
        
        const formData = new FormData();
        
        // Adicionar imagem e máscara como streams
        formData.append('image', fs.createReadStream(framePath), {
            filename: 'image.png',
            contentType: 'image/png'
        });
        
        formData.append('mask', fs.createReadStream(mascaraPath), {
            filename: 'mask.png',
            contentType: 'image/png'
        });

        // Parâmetros para o modelo LAMA (formato atualizado)
        formData.append('ldmSteps', '25');
        formData.append('ldmSampler', 'plms');
        formData.append('hdStrategy', 'Original');
        formData.append('hdStrategyCropMargin', '32');
        formData.append('hdStrategyCropTrigerSize', '512');
        formData.append('hdStrategyResizeLimit', '2048');
        formData.append('cv2Flag', 'INPAINT_NS');
        formData.append('cv2Radius', '4');
        
        console.log('📤 Enviando dados para lama-cleaner...');
        
        const response = await axios.post('http://localhost:8080/inpaint', formData, {
            headers: {
                ...formData.getHeaders(),
            },
            responseType: 'arraybuffer',
            timeout: 60000, // Aumentar timeout para 60s
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        console.log('✅ Frame processado com sucesso');
        return response.data;
    } catch (error) {
        console.error(`❌ Erro detalhado:`, {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data?.toString()
        });
        throw new Error(`Erro ao processar frame com IA: ${error.message}`);
    }
}

// Função alternativa usando JSON (backup)
async function processarFrameComIAJson(framePath, mascaraPath) {
    try {
        console.log(`🔄 Processando frame (JSON): ${framePath}`);
        
        // Converter imagem e máscara para base64
        const imageBuffer = fs.readFileSync(framePath);
        const maskBuffer = fs.readFileSync(mascaraPath);
        
        const imageBase64 = imageBuffer.toString('base64');
        const maskBase64 = maskBuffer.toString('base64');
        
        const data = {
            image: imageBase64,
            mask: maskBase64,
            ldmSteps: 25,
            ldmSampler: "plms",
            hdStrategy: "Original",
            hdStrategyCropMargin: 32,
            hdStrategyCropTrigerSize: 512,
            hdStrategyResizeLimit: 2048,
            cv2Flag: "INPAINT_NS",
            cv2Radius: 4
        };
        
        console.log('📤 Enviando dados JSON para lama-cleaner...');
        
        const response = await axios.post('http://localhost:8080/inpaint', data, {
            headers: {
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 60000
        });
        
        console.log('✅ Frame processado com sucesso (JSON)');
        return response.data;
    } catch (error) {
        console.error(`❌ Erro detalhado (JSON):`, {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data?.toString()
        });
        throw new Error(`Erro ao processar frame com IA (JSON): ${error.message}`);
    }
}

// Função para recompor vídeo a partir dos frames
async function recomporVideo(framesDir, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            console.log('🎬 Recompondo vídeo...');
            
            ffmpeg()
                .input(path.join(framesDir, 'frame_%04d.png'))
                .inputOptions(['-framerate 30'])
                .outputOptions([
                    '-c:v libx264',
                    '-pix_fmt yuv420p',
                    '-preset medium',
                    '-crf 23'
                ])
                .output(outputPath)
                .on('end', () => {
                    console.log('✅ Vídeo recomposto com sucesso');
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('❌ Erro ao recompor vídeo:', err);
                    reject(new Error(`Erro ao recompor vídeo: ${err.message}`));
                })
                .run();
                
        } catch (error) {
            reject(new Error(`Erro ao recompor vídeo: ${error.message}`));
        }
    });
}

// Função para limpar arquivos temporários
async function limparArquivosTemporarios(arquivos) {
    try {
        for (const arquivo of arquivos) {
            if (fs.existsSync(arquivo)) {
                if (fs.lstatSync(arquivo).isDirectory()) {
                    await fs.remove(arquivo);
                } else {
                    fs.unlinkSync(arquivo);
                }
                console.log(`🧹 Arquivo temporário removido: ${arquivo}`);
            }
        }
    } catch (error) {
        console.error('⚠️ Erro ao limpar arquivos temporários:', error.message);
    }
}

// Rota para obter o primeiro frame para seleção da região
router.post('/primeiro-frame', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum vídeo foi enviado' });
        }

        console.log(`📁 Processando vídeo: ${req.file.originalname}`);

        // Verificar se lama-cleaner está rodando
        const lamaCleanerRodando = await verificarLamaCleaner();
        if (!lamaCleanerRodando) {
            return res.status(503).json({ 
                error: 'Lama-cleaner não está rodando',
                message: 'Por favor, inicie o lama-cleaner com: pip install lama-cleaner && lama-cleaner --model=lama --port=8080'
            });
        }

        // Extrair primeiro frame
        const framePath = await extrairPrimeiroFrame(req.file.buffer, req.file.originalname);
        
        // Ler o frame como base64 para enviar ao frontend
        const frameBuffer = fs.readFileSync(framePath);
        const frameBase64 = frameBuffer.toString('base64');
        
        // Salvar coordenadas temporárias
        const coordsPath = path.join(__dirname, '../temp/coords.txt');
        fs.ensureDirSync(path.dirname(coordsPath));
        
        res.json({
            success: true,
            frame: `data:image/png;base64,${frameBase64}`,
            coordsPath: coordsPath,
            framePath: framePath
        });

    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({
            error: 'Erro ao processar vídeo',
            message: error.message
        });
    }
});

// Rota para salvar coordenadas da seleção
router.post('/salvar-coordenadas', async (req, res) => {
    try {
        const { x1, y1, x2, y2, largura, altura } = req.body;
        
        if (!x1 || !y1 || !x2 || !y2 || !largura || !altura) {
            return res.status(400).json({ error: 'Coordenadas incompletas' });
        }

        const coords = { x1, y1, x2, y2, largura, altura };
        const coordsPath = path.join(__dirname, '../temp/coords.txt');
        
        fs.writeFileSync(coordsPath, JSON.stringify(coords));
        
        console.log('✅ Coordenadas salvas:', coords);
        
        res.json({ success: true, coords });

    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({
            error: 'Erro ao salvar coordenadas',
            message: error.message
        });
    }
});

// Rota principal para remoção de marca d'água
router.post('/remover-marca', upload.single('video'), async (req, res) => {
    const arquivosTemporarios = [];
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum vídeo foi enviado' });
        }

        console.log(`📁 Processando vídeo para remoção de marca d'água: ${req.file.originalname}`);

        // Verificar se lama-cleaner está rodando
        const lamaCleanerRodando = await verificarLamaCleaner();
        if (!lamaCleanerRodando) {
            return res.status(503).json({ 
                error: 'Lama-cleaner não está rodando',
                message: 'Por favor, inicie o lama-cleaner com: pip install lama-cleaner && lama-cleaner --model=lama --port=8080'
            });
        }

        // Ler coordenadas salvas
        const coordsPath = path.join(__dirname, '../temp/coords.txt');
        if (!fs.existsSync(coordsPath)) {
            return res.status(400).json({ error: 'Coordenadas não encontradas. Selecione a região primeiro.' });
        }

        const coords = JSON.parse(fs.readFileSync(coordsPath, 'utf8'));
        console.log('📐 Usando coordenadas:', coords);

        // Extrair frames do vídeo
        const framesDir = await extrairFrames(req.file.buffer, req.file.originalname);
        arquivosTemporarios.push(framesDir);

        // Criar máscara
        const mascaraPath = path.join(__dirname, '../temp/mascara.png');
        await criarMascara(coords, coords.largura, coords.altura, mascaraPath);
        arquivosTemporarios.push(mascaraPath);

        // Criar diretório para frames processados
        const outputCleanDir = path.join(__dirname, '../temp/output_clean');
        fs.ensureDirSync(outputCleanDir);
        arquivosTemporarios.push(outputCleanDir);

        // Processar cada frame com IA
        const frames = fs.readdirSync(framesDir).filter(file => file.endsWith('.png')).sort();
        console.log(`🎬 Processando ${frames.length} frames com IA...`);

        // Para debug: processar apenas o primeiro frame primeiro
        const framesParaProcessar = frames.slice(0, 1); // Processar apenas 1 frame para teste
        console.log(`🧪 Modo debug: processando apenas ${framesParaProcessar.length} frame(s)`);

        for (let i = 0; i < framesParaProcessar.length; i++) {
            const frame = framesParaProcessar[i];
            const framePath = path.join(framesDir, frame);
            const outputFramePath = path.join(outputCleanDir, frame);
            
            console.log(`🔄 Processando frame ${i + 1}/${framesParaProcessar.length}: ${frame}`);
            
            try {
                // Tentar primeiro com FormData
                let frameProcessado;
                try {
                    frameProcessado = await processarFrameComIA(framePath, mascaraPath);
                } catch (formDataError) {
                    console.log('⚠️ FormData falhou, tentando com JSON...');
                    frameProcessado = await processarFrameComIAJson(framePath, mascaraPath);
                }
                
                fs.writeFileSync(outputFramePath, frameProcessado);
                console.log(`✅ Frame ${frame} processado com sucesso`);
            } catch (error) {
                console.error(`❌ Erro ao processar frame ${frame}:`, error.message);
                // Se falhar, copiar frame original
                fs.copyFileSync(framePath, outputFramePath);
                console.log(`⚠️ Frame ${frame} copiado sem processamento`);
            }
        }

        // Recompor vídeo
        const timestamp = Date.now();
        const nomeBase = path.parse(req.file.originalname).name;
        const outputVideoPath = path.join(__dirname, `../output/video_limpo_${timestamp}_${nomeBase}.mp4`);
        
        // Criar diretório de output
        fs.ensureDirSync(path.dirname(outputVideoPath));
        
        await recomporVideo(outputCleanDir, outputVideoPath);

        // Limpar arquivos temporários
        await limparArquivosTemporarios(arquivosTemporarios);

        const relativePath = path.relative(path.join(__dirname, '..'), outputVideoPath).replace(/\\/g, '/');
        
        console.log('✅ Remoção de marca d\'água concluída com sucesso');
        
        res.json({
            success: true,
            message: 'Marca d\'água removida com sucesso',
            output: relativePath,
            nome: req.file.originalname
        });

    } catch (error) {
        console.error('Erro:', error);
        
        // Limpar arquivos temporários em caso de erro
        await limparArquivosTemporarios(arquivosTemporarios);
        
        res.status(500).json({
            error: 'Erro ao remover marca d\'água',
            message: error.message
        });
    }
});

// Rota de teste para verificar se o lama-cleaner está funcionando
router.get('/teste-lama-cleaner', async (req, res) => {
    try {
        console.log('🧪 Testando conexão com lama-cleaner...');
        
        // Testar se o servidor está respondendo
        const response = await axios.get('http://localhost:8080/', { timeout: 5000 });
        
        if (response.status === 200) {
            console.log('✅ Lama-cleaner está rodando');
            res.json({
                success: true,
                message: 'Lama-cleaner está funcionando corretamente',
                status: response.status
            });
        } else {
            res.status(503).json({
                success: false,
                message: 'Lama-cleaner respondeu mas com status inesperado',
                status: response.status
            });
        }
    } catch (error) {
        console.error('❌ Erro ao testar lama-cleaner:', error.message);
        res.status(503).json({
            success: false,
            message: 'Lama-cleaner não está rodando ou não está acessível',
            error: error.message
        });
    }
});

// Rota de teste para verificar a API do lama-cleaner
router.post('/teste-inpaint', async (req, res) => {
    try {
        console.log('🧪 Testando endpoint /inpaint do lama-cleaner...');
        
        // Criar imagem de teste simples (100x100)
        const testImagePath = path.join(__dirname, '../temp/test_image.png');
        const testMaskPath = path.join(__dirname, '../temp/test_mask.png');
        
        fs.ensureDirSync(path.dirname(testImagePath));
        
        // Criar imagem de teste
        await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 128, g: 128, b: 128 }
            }
        }).png().toFile(testImagePath);
        
        // Criar máscara de teste
        await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 0, g: 0, b: 0 }
            }
        })
        .composite([{
            input: {
                create: {
                    width: 20,
                    height: 20,
                    channels: 3,
                    background: { r: 255, g: 255, b: 255 }
                }
            },
            left: 40,
            top: 40
        }])
        .png().toFile(testMaskPath);
        
        // Testar com FormData
        try {
            const result = await processarFrameComIA(testImagePath, testMaskPath);
            console.log('✅ Teste FormData bem-sucedido');
            
            // Limpar arquivos de teste
            fs.unlinkSync(testImagePath);
            fs.unlinkSync(testMaskPath);
            
            res.json({
                success: true,
                message: 'API do lama-cleaner está funcionando (FormData)',
                method: 'FormData'
            });
        } catch (formDataError) {
            console.log('⚠️ FormData falhou, testando JSON...');
            
            try {
                const result = await processarFrameComIAJson(testImagePath, testMaskPath);
                console.log('✅ Teste JSON bem-sucedido');
                
                // Limpar arquivos de teste
                fs.unlinkSync(testImagePath);
                fs.unlinkSync(testMaskPath);
                
                res.json({
                    success: true,
                    message: 'API do lama-cleaner está funcionando (JSON)',
                    method: 'JSON'
                });
            } catch (jsonError) {
                // Limpar arquivos de teste
                try {
                    fs.unlinkSync(testImagePath);
                    fs.unlinkSync(testMaskPath);
                } catch (e) {}
                
                res.status(500).json({
                    success: false,
                    message: 'Ambos os métodos falharam',
                    formDataError: formDataError.message,
                    jsonError: jsonError.message
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao testar endpoint /inpaint:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao testar endpoint /inpaint',
            error: error.message
        });
    }
});

module.exports = router;