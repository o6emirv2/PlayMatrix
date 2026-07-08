const express = require('express'); const env = require('../config/env'); const { requireAuth } = require('../core/security');
const router = express.Router();
router.get('/public/runtime-config', (req,res)=>res.json({ ok:true, ...env.publicRuntimeConfig(), requestId: req.requestId || null }));
router.get('/auth/me', requireAuth, (req,res)=>res.json({ ok:true, user:req.user }));
module.exports = router;
