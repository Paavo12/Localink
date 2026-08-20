const multer = require('multer');

// Use memory storage (no disk writing)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept any image type (checked via MIME type, which is what actually
  // matters -- browsers/OSes set this based on real file content, not just
  // the extension). Previously only allowed jpeg/jpg/png/webp, which
  // silently rejected perfectly valid photos in newer formats like AVIF,
  // HEIC (iPhone default), GIF, or SVG.
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Proof-of-payment uploads can be a photo, scan, or PDF of a bank receipt/statement,
// so this accepts any file type rather than restricting to images.
const documentFileFilter = (req, file, cb) => {
  cb(null, true);
};
const uploadAny = multer({ storage, fileFilter: documentFileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = upload;
module.exports.uploadAny = uploadAny;