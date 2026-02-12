const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/gif', 'image/webp', 'video/mp4', 'video/webm'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only GIF, WebP, MP4, and WebM are allowed.'));
        }
    }
});

// Root endpoint - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'GIF/WebP to Video Converter API is running',
        timestamp: new Date().toISOString()
    });
});

// Upload endpoint to DongTube CDN
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }

        const file = req.file;
        const fileSize = file.size;
        const maxSize = 100 * 1024 * 1024; // 100MB

        if (fileSize > maxSize) {
            return res.status(400).json({
                success: false,
                error: `File too large. Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB. Max: 100 MB`
            });
        }

        // Get file extension
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `converted-${Date.now()}${ext}`;

        // Create FormData for DongTube CDN
        const form = new FormData();
        form.append('file', file.buffer, {
            filename: filename,
            contentType: file.mimetype
        });

        // Upload to DongTube CDN
        const response = await axios.post(
            'https://cdn.dongtube.my.id/upload',
            form,
            {
                headers: {
                    ...form.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        if (!response.data) {
            throw new Error('Server tidak merespon');
        }

        const result = response.data.result || response.data;
        const url = result.url || result.file || result.link;

        if (!url) {
            throw new Error('Upload failed or invalid response');
        }

        res.json({
            success: true,
            data: {
                url: url,
                filename: filename,
                size: fileSize,
                sizeFormatted: (fileSize / 1024 / 1024).toFixed(2) + ' MB',
                format: ext,
                mimetype: file.mimetype
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
});

// Get file info endpoint
app.post('/api/file-info', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const file = req.file;
        
        res.json({
            success: true,
            data: {
                name: file.originalname,
                size: file.size,
                sizeFormatted: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                mimetype: file.mimetype,
                extension: path.extname(file.originalname)
            }
        });

    } catch (error) {
        console.error('File info error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 100MB'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server (only if not in Vercel)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
        console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);
    });
}

// Export for Vercel
module.exports = app;
