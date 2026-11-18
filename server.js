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

// 2. API lấy danh sách file theo thư mục động
app.get('/api/files', async (req, res) => {
    try {
        const folder = req.query.folder || 'posts';
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(folder)}?ref=${GITHUB_BRANCH}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server'
            }
        });

        const data = await response.json();
        if (response.ok && Array.isArray(data)) {
            const files = data
                .filter(item => item.type === 'file')
                .map(item => item.name);
            res.json({ success: true, files });
        } else {
            res.json({ success: true, files: [], message: 'Thư mục trống hoặc chưa tồn tại trên Git' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. API đọc nội dung một file cụ thể theo thư mục
app.get('/api/file', async (req, res) => {
    try {
        const folder = req.query.folder || 'posts';
        const filename = req.query.filename;
        
        if (!filename) {
            return res.status(400).json({ success: false, message: 'Thiếu tên file' });
        }

        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}?ref=${GITHUB_BRANCH}`;
        
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
            res.json({ success: false, message: 'Không tìm thấy file' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. API lưu, cập nhật hoặc đổi tên file trong thư mục chỉ định
app.post('/api/save', async (req, res) => {
    try {
        const { folder, fileName, originalFileName, content } = req.body;
        const targetFolder = folder || 'posts';

        if (!fileName) {
            return res.status(400).json({ success: false, message: 'Tên file không được để trống!' });
        }

        const encodedContent = Buffer.from(content, 'utf8').toString('base64');

        // Kiểm tra file mới đã tồn tại chưa (để lấy SHA nếu cập nhật)
        let fileSha = null;
        const checkUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(targetFolder)}/${encodeURIComponent(fileName)}?ref=${GITHUB_BRANCH}`;
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

        // Lưu file vào thư mục đích trên GitHub
        const saveUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(targetFolder)}/${encodeURIComponent(fileName)}`;
        const saveResponse = await fetch(saveUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js-Server'
            },
            body: JSON.stringify({
                message: fileSha ? `Cập nhật ${targetFolder}/${fileName} qua web editor` : `Thêm mới ${targetFolder}/${fileName} qua web editor`,
                content: encodedContent,
                branch: GITHUB_BRANCH,
                sha: fileSha
            })
        });

        const saveResult = await saveResponse.json();

        if (!saveResponse.ok) {
            return res.status(400).json({ success: false, message: saveResult.message || 'Lỗi khi lưu file lên GitHub' });
        }

        // Xử lý xóa file cũ nếu đổi tên file
        if (originalFileName && originalFileName !== fileName) {
            try {
                const oldCheckUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(targetFolder)}/${encodeURIComponent(originalFileName)}?ref=${GITHUB_BRANCH}`;
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
                            message: `Xóa file cũ ${targetFolder}/${originalFileName} do đổi tên`,
                            sha: oldFileData.sha,
                            branch: GITHUB_BRANCH
                        })
                    });
                }
            } catch (err) {
                console.error('Lỗi khi xóa file cũ sau khi đổi tên:', err);
            }
        }

        res.json({ success: true, message: `Đã lưu thành công vào thư mục "${targetFolder}/${fileName}"!` });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. API Xóa file trên GitHub
app.delete('/api/delete', async (req, res) => {
    try {
        const { folder, fileName } = req.body;
        const targetFolder = folder || 'posts';

        if (!fileName) {
            return res.status(400).json({ success: false, message: 'Thiếu tên file cần xóa!' });
        }

        // 1. Lấy SHA của file cần xóa
        const fileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(targetFolder)}/${encodeURIComponent(fileName)}?ref=${GITHUB_BRANCH}`;
        const checkRes = await fetch(fileUrl, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server'
            }
        });

        if (!checkRes.ok) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy file trên GitHub để xóa!' });
        }

        const fileData = await checkRes.json();

        // 2. Thực hiện lệnh DELETE lên GitHub API
        const deleteRes = await fetch(fileUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js-Server'
            },
            body: JSON.stringify({
                message: `Xóa file ${targetFolder}/${fileName} qua trình soạn thảo`,
                sha: fileData.sha,
                branch: GITHUB_BRANCH
            })
        });

        if (deleteRes.ok) {
            res.json({ success: true, message: `Đã xóa thành công file "${fileName}" khỏi thư mục "${targetFolder}"!` });
        } else {
            const errData = await deleteRes.json();
            res.status(400).json({ success: false, message: errData.message || 'Lỗi khi xóa file trên GitHub' });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});
