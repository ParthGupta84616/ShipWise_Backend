const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Check for MONGO_URI
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI environment variable is not set. Please set it in your environment or config.env file.");
        }

        // Connection options for better performance and reliability
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        };

        // Connect to MongoDB
        const connection = await mongoose.connect(process.env.MONGO_URI, options);

        console.log(`🗄️  MongoDB Connected: ${connection.connection.host}`);
        console.log(`📊 Database: ${connection.connection.name}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                console.log('MongoDB connection closed through app termination');
                process.exit(0);
            } catch (error) {
                console.error('Error during MongoDB disconnection:', error);
                process.exit(1);
            }
        });

        return connection;

    } catch (error) {
        console.error('Database connection failed:', error.message);
        
        // Retry connection after 5 seconds
        console.log('Retrying database connection in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
}; 

module.exports = connectDB;