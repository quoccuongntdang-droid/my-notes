const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'quoccuongntdang-droid'; //[span_2](start_span)[span_2](end_span)
const GITHUB_REPO = 'my-notes'; //[span_3](start_span)[span_3](end_span)

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. API lấy danh sách các file trong thư mục posts/ trên GitHub
app.get('/api/files', async (req, res) => {
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts`; //[span_4](start_span)[span_4](end_span)
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node-App' } //[span_5](start_span)[span_5](end_span)
        });

        if (response.ok) {
            const files = await response.json();
            // Lọc ra các file html hoặc md
            const fileList = files.filter(f => f.type === 'file').map(f => f.name);
            res.json({ success: true, files: fileList });
        } else {
            res.json({ success: true, files: [] }); // Thư mục posts chưa có gì thì trả về mảng trống
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. API đọc nội dung của một file cụ thể để hiện lên khung soạn thảo
app.get('/api/file/:filename', async (req, res) => {
    try {
        const fileName = req.params.filename;
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${fileName}`; //[span_6](start_span)[span_6](end_span)
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node-App' } //[span_7](start_span)[span_7](end_span)
        });

        if (response.ok) {
            const fileData = await response.json();
            // Nội dung GitHub trả về dạng Base64, cần decode sang dạng chữ HTML
            const contentHtml = Buffer.from(fileData.content, 'base64').toString('utf-8');
            res.json({ success: true, content: contentHtml });
        } else {
            res.status(404).json({ success: false, message: 'Không tìm thấy file!' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. API lưu/cập nhật file lên GitHub (như cũ)
app.post('/api/save', async (req, res) => {
    const { fileName, contentHtml } = req.body;

    if (!fileName || !contentHtml) {
        return res.status(400).json({ success: false, message: 'Thiếu tên file hoặc nội dung!' });
    }

    let cleanFileName = fileName.trim();
    if (!cleanFileName.endsWith('.html') && !cleanFileName.endsWith('.md')) {
        cleanFileName += '.html';
    }

    const contentBase64 = Buffer.from(contentHtml, 'utf-8').toString('base64');
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${cleanFileName}`; //[span_8](start_span)[span_8](end_span)

    try {
        let sha = null;
        const checkRes = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node-App' } //[span_9](start_span)[span_9](end_span)
        });
        if (checkRes.ok) {
            const fileData = await checkRes.json();
            sha = fileData.sha;
        }

        const bodyData = {
            message: `Cập nhật bài viết qua web app mobile: ${cleanFileName}`,
            content: contentBase64,
        };
        if (sha) bodyData.sha = sha;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`, //[span_10](start_span)[span_10](end_span)
                'Content-Type': 'application/json',
                'User-Agent': 'Node-App'
            },
            body: JSON.stringify(bodyData)
        });

        if (response.ok) {
            res.json({ success: true, message: `Đã lưu thành công file "${cleanFileName}"!` });
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
