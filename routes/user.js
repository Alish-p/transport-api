const { Router } = require('express');
const { loginUser, registerUser } = require('../controllers/user');

const { private, admin } = require('../middlewares/Auth');
const router = Router();

router.post('/', registerUser);
router.post('/login', loginUser);

module.exports = router;
