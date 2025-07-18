import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import FAQ from '../models/FAQ';

const MONGO_URI = process.env.MONGO_URI || 'your-mongodb-uri-here';

const faqs = [
  {
    question: 'How do I reset my password?',
    answer: 'Go to the login page and click on "Reset Password". Follow the instructions sent to your email.'
  },
  {
    question: 'How can I contact support?',
    answer: 'You can contact support via the chat feature or email us at support@tradespot.online.'
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes, we use industry-standard security practices to protect your data.'
  },
  {
    question: 'How do I deposit funds?',
    answer: 'Navigate to the Deposit page from your dashboard and follow the instructions.'
  },
  {
    question: 'How do I withdraw funds?',
    answer: 'Go to the Withdraw page, enter your details, and submit your request.'
  },
  {
    question: 'What is Flex Drop and how do I claim it?',
    answer: 'Flex Drop is a special reward. You can claim it using a link provided by the admin on the Flex Drop page.'
  },
  {
    question: 'How do I join a team?',
    answer: 'Visit the Team page and follow the instructions to join or create a team.'
  },
  {
    question: 'How do I view my transaction history?',
    answer: 'Go to the Transaction History page from your dashboard.'
  },
  {
    question: 'How do I enable two-factor authentication (2FA)?',
    answer: 'Visit Settings > 2FA and follow the setup instructions.'
  },
  {
    question: 'How do I manage my privacy settings?',
    answer: 'Go to Settings > Privacy to adjust your privacy preferences.'
  },
  {
    question: 'How do I earn rewards?',
    answer: 'Rewards are given for completing certain actions. Visit the Rewards page for details.'
  },
  {
    question: 'How do I use the chat feature?',
    answer: 'Click on the Chat icon in your dashboard to start chatting with support or other users.'
  },
  {
    question: 'What should I do if I encounter an error?',
    answer: 'Try refreshing the page. If the issue persists, contact support.'
  },
  {
    question: 'How do I simulate a trade?',
    answer: 'Go to the Market page and use the simulation feature to try out trades before committing real funds.'
  },
  {
    question: 'What is WebAuthn and how do I enable it?',
    answer: 'WebAuthn is an advanced security feature. Go to Settings > WebAuthn to enable or manage it for actions like transfer, withdraw, or convert.'
  },
  {
    question: 'How do I monitor my portfolio and daily returns?',
    answer: 'Visit the Portfolio page to see your assets, performance, and daily returns.'
  },
  {
    question: 'How do I receive announcements or notifications?',
    answer: 'Announcements are shown on the Announcement page. Notifications appear in your dashboard and the Notifications page.'
  },
  {
    question: 'How do I claim rewards or awards?',
    answer: 'Visit the Rewards page for user rewards. Admins can manage awards in the Admin Awards section.'
  },
  {
    question: 'What is the Team Members Table Modal?',
    answer: 'This modal shows all members in your team. Access it from the Team page.'
  },
  {
    question: 'How do I use the Flex Drop feature?',
    answer: 'Flex Drop links are provided by admins. Claim your Flex Drop on the Flex Drop Claim page using your unique link.'
  },
  {
    question: 'How do I contact an admin?',
    answer: 'Use the Admin Chat feature or email support@tradespot.online.'
  },
  {
    question: 'What happens if I forget my password?',
    answer: 'Use the Forgot Password link on the login page to reset your password.'
  },
  {
    question: 'How do I update my account information?',
    answer: 'Go to Settings > Edit Basic to update your profile and account details.'
  },
  {
    question: 'How do I view or manage my withdrawal requests?',
    answer: 'Visit the Withdraw page for new requests. Admins can view all withdrawals in the Admin Withdrawals section.'
  },
  {
    question: 'How do I use two-factor authentication (2FA) for withdrawals or transfers?',
    answer: 'Enable WebAuthn in Settings and configure it for specific actions like transfer, withdraw, or convert.'
  },
  {
    question: 'How do I check my transaction history?',
    answer: 'Go to the Transaction History page from your dashboard.'
  },
];

async function seedFAQs() {
  try {
    await mongoose.connect(MONGO_URI);
    await FAQ.deleteMany({}); // Remove existing FAQs
    await FAQ.insertMany(faqs);
    console.log('FAQs seeded successfully!');
    mongoose.disconnect();
  } catch (err) {
    console.error('Error seeding FAQs:', err);
    mongoose.disconnect();
    process.exit(1);
  }
}

seedFAQs();
