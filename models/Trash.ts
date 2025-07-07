import mongoose from 'mongoose';

const TrashSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Trash = mongoose.model('Trash', TrashSchema);
export default Trash;
