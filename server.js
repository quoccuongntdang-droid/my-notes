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

// 2. API quét danh sách tất cả các thư mục ở gốc GitHub repository
app.get('/api/folders', async (req, res) => {
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
            // Lọc ra các item là thư mục (dir)
            const folders = data
                .filter(item => item.type === 'dir')
                .map(item => item.name);
            res.json({ success: true, folders });
        } else {
            res.json({ success: true, folders: ['posts'] }); // Mặc định nếu lỗi
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. API lấy danh sách file theo thư mục động
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
            res.json({ success: true, files: [], message: 'Thư mục trống' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. API đọc nội dung một file cụ thể
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
            res.json({ success: false, message: 'Không tìm thấy nội dung file' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. API lưu file
app.post('/api/save', async (req, res) => {
    try {
        const { folder, fileName, originalFileName, content } = req.body;
        const targetFolder = folder || 'posts';

        if (!fileName) {
            return res.status(400).json({ success: false, message: 'Tên file không được để trống!' });
        }

        const encodedContent = Buffer.from(content, 'utf8').toString('base64');

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

        const saveUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(targetFolder)}/${encodeURIComponent(fileName)}`;
        const saveResponse = await fetch(saveUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js-Server'
            },
            body: JSON.stringify({
                message: fileSha ? `Cập nhật ${targetFolder}/${fileName}` : `Thêm mới ${targetFolder}/${fileName}`,
                content: encodedContent,
                branch: GITHUB_BRANCH,
                sha: fileSha
            })
        });

        const saveResult = await saveResponse.json();
        if (!saveResponse.ok) {
            return res.status(400).json({ success: false, message: saveResult.message || 'Lỗi khi lưu file' });
        }

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
                            message: `Xóa file cũ do đổi tên`,
                            sha: oldFileData.sha,
                            branch: GITHUB_BRANCH
                        })
                    });
                }
            } catch (err) {
                console.error('Lỗi khi xóa file cũ:', err);
            }
        }

        res.json({ success: true, message: `Đã lưu thành công vào "${targetFolder}/${fileName}"!` });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 6. API Xóa file
app.delete('/api/delete', async (req, res) => {
    try {
        const { folder, fileName } = req.body;
        const targetFolder = folder || 'posts';

        if (!fileName) {
            return res.status(400).json({ success: false, message: 'Thiếu tên file cần xóa!' });
        }

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

        const deleteRes = await fetch(fileUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js-Server'
            },
            body: JSON.stringify({
                message: `Xóa file ${targetFolder}/${fileName}`,
                sha: fileData.sha,
                branch: GITHUB_BRANCH
            })
        });

        if (deleteRes.ok) {
            res.json({ success: true, message: `Đã xóa thành công file "${fileName}"!` });
        } else {
            const errData = await deleteRes.json();
            res.status(400).json({ success: false, message: errData.message || 'Lỗi khi xóa file' });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 7. API Chuyển file giữa các thư mục
app.post('/api/move', async (req, res) => {
    try {
        const { currentFolder, targetFolder, fileName, content } = req.body;

        if (!fileName || !targetFolder) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin file hoặc thư mục đích!' });
        }

        const encodedContent = Buffer.from(content, 'utf8').toString('base64');

        const newFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(targetFolder)}/${encodeURIComponent(fileName)}`;
        
        let targetSha = null;
        const checkTarget = await fetch(`${newFileUrl}?ref=${GITHUB_BRANCH}`, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node.js-Server' }
        });
        if (checkTarget.ok) {
            const targetData = await checkTarget.json();
            targetSha = targetData.sha;
        }

        const createRes = await fetch(newFileUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js-Server'
            },
            body: JSON.stringify({
                message: `Chuyển file ${fileName} từ ${currentFolder} sang ${targetFolder}`,
                content: encodedContent,
                branch: GITHUB_BRANCH,
                sha: targetSha
            })
        });

        if (!createRes.ok) {
            const errData = await createRes.json();
            return res.status(400).json({ success: false, message: errData.message || 'Lỗi khi tạo file ở thư mục mới' });
        }

        const oldFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(currentFolder)}/${encodeURIComponent(fileName)}?ref=${GITHUB_BRANCH}`;
        const checkOld = await fetch(oldFileUrl, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Node.js-Server' }
        });

        if (checkOld.ok) {
            const oldData = await checkOld.json();
            await fetch(oldFileUrl, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Node.js-Server'
                },
                body: JSON.stringify({
                    message: `Xóa file cũ ở ${currentFolder} sau khi chuyển`,
                    sha: oldData.sha,
                    branch: GITHUB_BRANCH
                })
            });
        }

        res.json({ success: true, message: `Đã chuyển file thành công sang thư mục "${targetFolder}"!` });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});
