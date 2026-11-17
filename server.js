const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cấu hình GitHub (Lấy từ biến môi trường trên Render)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER; // Tên user hoặc tổ chức trên GitHub (VD: quoccuongntdang-droid)
const GITHUB_REPO = process.env.GITHUB_REPO;   // Tên repository (VD: my-notes)
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// 1. Phục vụ file index.html giao diện chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. API lấy danh sách các file trong GitHub Repository
app.get('/api/files', async (req, res) => {
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents?ref=${GITHUB_BRANCH}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server'
            }
        });

        const data = await response.json();
        if (response.ok && Array.isArray(data)) {
            // Lọc ra các file có đuôi .md hoặc .html (hoặc tùy bạn chọn)
            const files = data
                .filter(item => item.type === 'file' && (item.name.endsWith('.md') || item.name.endsWith('.html')))
                .map(item => item.name);
            res.json({ success: true, files });
        } else {
            res.json({ success: false, message: data.message || 'Không thể lấy danh sách file từ GitHub' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. API đọc nội dung của một file cụ thể
app.get('/api/file/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}?ref=${GITHUB_BRANCH}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server'
            }
        });

        const data = await response.json();
        if (response.ok && data.content) {
            // Nội dung trên GitHub được mã hóa Base64, cần giải mã ra text
            const buffer = Buffer.from(data.content, 'base64');
            const content = buffer.toString('utf8');
            res.json({ success: true, content });
        } else {
            res.json({ success: false, message: 'Không tìm thấy file trên GitHub' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. API lưu file lên GitHub (Hỗ trợ cả tạo mới, cập nhật nội dung và đổi tên file)
app.post('/api/save', async (req, res) => {
    try {
        const { fileName, originalFileName, content } = req.body;

        if (!fileName) {
            return res.status(400).json({ success: false, message: 'Tên file không được để trống!' });
        }

        const encodedContent = Buffer.from(content, 'utf8').toString('base64');

        // Bước A: Kiểm tra xem file mới đã tồn tại trên GitHub chưa (để lấy SHA nếu là cập nhật)
        let fileSha = null;
        const checkUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}?ref=${GITHUB_BRANCH}`;
        const checkRes = await fetch(checkUrl, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server'
            }
        });
        
        if (checkRes.ok) {
            const fileData = await checkRes.json();
            fileSha = fileData.sha;
        }

        // Bước B: Tạo hoặc cập nhật file với tên mới (`fileName`)
        const saveUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`;
        const saveResponse = await fetch(saveUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js-Server'
            },
            body: JSON.stringify({
                message: fileSha ? `Cập nhật file ${fileName} qua web editor` : `Thêm mới file ${fileName} qua web editor`,
                content: encodedContent,
                branch: GITHUB_BRANCH,
                sha: fileSha // Nếu file đã tồn tại, cần truyền sha để GitHub cho phép update
            })
        });

        const saveResult = await saveResponse.json();

        if (!saveResponse.ok) {
            return res.status(400).json({ success: false, message: saveResult.message || 'Lỗi khi lưu file lên GitHub' });
        }

        // Bước C: Xử lý đổi tên (Nếu có `originalFileName` khác với `fileName` mới và file cũ thực sự tồn tại)
        if (originalFileName && originalFileName !== fileName) {
            try {
                // 1. Lấy SHA của file cũ
                const oldCheckUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${originalFileName}?ref=${GITHUB_BRANCH}`;
                const oldCheckRes = await fetch(oldCheckUrl, {
                    headers: {
                        'Authorization': `token ${GITHUB_TOKEN}`,
                        'User-Agent': 'Node.js-Server'
                    }
                });

                if (oldCheckRes.ok) {
                    const oldFileData = await oldCheckRes.json();
                    
                    // 2. Tiến hành xóa file cũ trên GitHub
                    await fetch(oldCheckUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `token ${GITHUB_TOKEN}`,
                            'Content-Type': 'application/json',
                            'User-Agent': 'Node.js-Server'
                        },
                        body: JSON.stringify({
                            message: `Xóa file cũ ${originalFileName} do đổi tên thành ${fileName}`,
                            sha: oldFileData.sha,
                            branch: GITHUB_BRANCH
                        })
                    });
                }
            } catch (err) {
                console.error('Lỗi khi xóa file cũ sau khi đổi tên:', err);
            }
        }

        res.json({ success: true, message: `Đã lưu thành công file "${fileName}" lên GitHub!` });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});
