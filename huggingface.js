const axios = require('axios');

async function queryHuggingFace(model, input) {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      { inputs: input },
      {
        headers: {
          'Authorization': 'Bearer hf_your_free_token_here', // Optional for public models
        }
      }
    );
    return response.data;
  } catch (err) {
    console.error('HuggingFace Error:', err.message);
    return '⚠️ Error from AI model.';
  }
}

module.exports = { queryHuggingFace };
