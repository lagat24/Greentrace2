// model.js
const tf = require("@tensorflow/tfjs-node");
const path = require("path");

// Path to your converted model (example: model/model.json)
// If still using .keras, you must convert it with `tensorflowjs_converter`
const MODEL_PATH = path.join(__dirname, "model", "model.json");

let model;

// -------------------------
// Load model once (cached)
// -------------------------
async function loadModel() {
  if (!model) {
    console.log("Loading TensorFlow model...");
    model = await tf.loadLayersModel("file://" + MODEL_PATH);
    console.log("Model loaded successfully.");
  }
  return model;
}

// -------------------------
// Preprocess uploaded image
// -------------------------
function preprocessImage(buffer) {
  return tf.tidy(() => {
    let img = tf.node.decodeImage(buffer, 3);
    img = tf.image.resizeBilinear(img, [224, 224]); // Change to your model size
    img = img.div(255.0);
    img = img.expandDims(0);
    return img;
  });
}

// -------------------------
// Predict sapling vs no-sapling
// -------------------------
async function classifyImage(imageBuffer) {
  const model = await loadModel();
  const processed = preprocessImage(imageBuffer);

  const prediction = model.predict(processed);
  const result = prediction.dataSync(); // [0.98, 0.02] etc.

  const sapling = result[0]; // adjust depending on your output layer

  return {
    confidence: sapling,
    label: sapling > 0.5 ? "sapling" : "no-sapling"
  };
}

module.exports = { classifyImage };
