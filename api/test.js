module.exports = async function handler(req, res) {
  res.status(200).json({
    success: true,
    message: 'Test API endpoint is working',
    timestamp: new Date().toISOString()
  });
};
