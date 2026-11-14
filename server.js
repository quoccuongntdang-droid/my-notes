const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'quoccuongntdang-droid'; //[span_0](start_span)[span_0](end_span)
const GITHUB_REPO = 'my-notes'; //[span_1](start_span)[span_1](end_span)

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Lấy danh sách file trong thư mục posts/ trên GitHub
app.get('/api/files', async (req, res) => {
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts`; //[span_2](start_span)[span_2](end_span)
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node-App' } //[span_3](start_span)[span_3](end_span)
        });

        if (response.ok) {
            const files = await response.json();
            const fileList = files.filter(f => f.type === 'file').map(f => f.name);
            res.json({ success: true, files: fileList });
        } else {
            res.json({ success: true, files: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Đọc nội dung file từ GitHub
app.get('/api/file/:filename', async (req, res) => {
    try {
        const fileName = req.params.filename;
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${fileName}`; //[span_4](start_span)[span_4](end_span)
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node-App' } //[span_5](start_span)[span_5](end_span)
        });

        if (response.ok) {
            const fileData = await response.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            res.json({ success: true, content: content });
        } else {
            res.status(404).json({ success: false, message: 'Không tìm thấy file!' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Lưu file lên GitHub (hỗ trợ .md và .html)
app.post('/api/save', async (req, res) => {
    const { fileName, content } = req.body;

    if (!fileName || !content) {
        return res.status(400).json({ success: false, message: 'Thiếu tên file hoặc nội dung!' });
    }

    let cleanFileName = fileName.trim();
    if (!cleanFileName.endsWith('.md') && !cleanFileName.endsWith('.html')) {
        cleanFileName += '.md'; // Mặc định là .md nếu không gõ đuôi
    }

    const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${cleanFileName}`; //[span_6](start_span)[span_6](end_span)

    try {
        let sha = null;
        const checkRes = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node-App' } //[span_7](start_span)[span_7](end_span)
        });
        if (checkRes.ok) {
            const fileData = await checkRes.json();
            sha = fileData.sha;
        }

        const bodyData = {
            message: `Cập nhật file Markdown qua web: ${cleanFileName}`,
            content: contentBase64,
        };
        if (sha) bodyData.sha = sha;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`, //[span_8](start_span)[span_8](end_span)
                'Content-Type': 'application/json',
                'User-Agent': 'Node-App'
            },
            body: JSON.stringify(bodyData)
        });

        if (response.ok) {
            res.json({ success: true, message: `Đã lưu thành công file "${cleanFileName}" lên GitHub!` });
        } else {
            const err = await response.json();
            res.status(500).json({ success: false, message: err.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});
