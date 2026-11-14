const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Lấy Token từ biến môi trường trên Render (Bảo mật)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Cấu hình cố định theo tài khoản và repo của bạn từ hình ảnh
const GITHUB_OWNER = 'quoccuongntdang-droid';
const GITHUB_REPO = 'my-notes';

// Phục vụ giao diện trang web
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API nhận nội dung soạn thảo từ web để đẩy lên GitHub
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
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${cleanFileName}`;

    try {
        let sha = null;
        const checkRes = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node-App' }
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
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node-App'
            },
            body: JSON.stringify(bodyData)
        });

        if (response.ok) {
            res.json({ success: true, message: `Đã lưu thành công file "${cleanFileName}" vào repo my-notes!` });
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
