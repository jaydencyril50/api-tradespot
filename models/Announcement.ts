import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  notice: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
