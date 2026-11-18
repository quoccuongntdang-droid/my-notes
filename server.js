const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// 1. Phục vụ file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. API lấy danh sách toàn bộ file trong thư mục posts/ trên GitHub
app.get('/api/files', async (req, res) => {
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts?ref=${GITHUB_BRANCH}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server'
            }
        });

        const data = await response.json();
        if (response.ok && Array.isArray(data)) {
            // Lấy tất cả các file là file thực tế trong thư mục posts/
            const files = data
                .filter(item => item.type === 'file')
                .map(item => item.name);
            res.json({ success: true, files });
        } else {
            res.json({ success: false, files: [], message: 'Thư mục posts trống hoặc không tìm thấy' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. API đọc nội dung một file cụ thể trong thư mục posts/ (hỗ trợ giải mã tên file đặc biệt)
app.get('/api/file/:filename', async (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${encodeURIComponent(filename)}?ref=${GITHUB_BRANCH}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server'
            }
        });

        const data = await response.json();
        if (response.ok && data.content) {
            const buffer = Buffer.from(data.content, 'base64');
            const content = buffer.toString('utf8');
            res.json({ success: true, content });
        } else {
            res.json({ success: false, message: 'Không tìm thấy file trong thư mục posts/' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. API lưu, cập nhật hoặc đổi tên file trong thư mục posts/
app.post('/api/save', async (req, res) => {
    try {
        const { fileName, originalFileName, content } = req.body;

        if (!fileName) {
            return res.status(400).json({ success: false, message: 'Tên file không được để trống!' });
        }

        const encodedContent = Buffer.from(content, 'utf8').toString('base64');

        // Kiểm tra xem file mới đã tồn tại chưa (để lấy SHA nếu cập nhật)
        let fileSha = null;
        const checkUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${encodeURIComponent(fileName)}?ref=${GITHUB_BRANCH}`;
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

        // Ghi/Tạo file vào thư mục posts/ trên GitHub
        const saveUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${encodeURIComponent(fileName)}`;
        const saveResponse = await fetch(saveUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js-Server'
            },
            body: JSON.stringify({
                message: fileSha ? `Cập nhật posts/${fileName} qua web editor` : `Thêm mới posts/${fileName} qua web editor`,
                content: encodedContent,
                branch: GITHUB_BRANCH,
                sha: fileSha
            })
        });

        const saveResult = await saveResponse.json();

        if (!saveResponse.ok) {
            return res.status(400).json({ success: false, message: saveResult.message || 'Lỗi khi lưu file lên GitHub' });
        }

        // Xử lý đổi tên file nếu tên mới khác tên cũ
        if (originalFileName && originalFileName !== fileName) {
            try {
                const oldCheckUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts/${encodeURIComponent(originalFileName)}?ref=${GITHUB_BRANCH}`;
                const oldCheckRes = await fetch(oldCheckUrl, {
                    headers: {
                        'Authorization': `token ${GITHUB_TOKEN}`,
                        'User-Agent': 'Node.js-Server'
                    }
                });

                if (oldCheckRes.ok) {
                    const oldFileData = await oldCheckRes.json();
                    
                    await fetch(oldCheckUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `token ${GITHUB_TOKEN}`,
                            'Content-Type': 'application/json',
                            'User-Agent': 'Node.js-Server'
                        },
                        body: JSON.stringify({
                            message: `Xóa file cũ posts/${originalFileName} do đổi tên`,
                            sha: oldFileData.sha,
                            branch: GITHUB_BRANCH
                        })
                    });
                }
            } catch (err) {
                console.error('Lỗi khi xóa file cũ sau khi đổi tên:', err);
            }
        }

        res.json({ success: true, message: `Đã lưu thành công file "posts/${fileName}" lên GitHub!` });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});
