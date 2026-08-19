const multer = require('multer');
const path = require('path');

// Use memory storage (no disk writing)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const mime = allowed.test(file.mimetype);
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  if (mime && ext) return cb(null, true);
  cb(new Error('Only images are allowed'));
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