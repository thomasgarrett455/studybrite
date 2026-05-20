import express from 'express';
import dotenv from 'dotenv';
import healthRouter from "./routes/health.routes.js";
import errorHandler from "./middleware/errorHandler.js"
import notFoundHandler from './middleware/notFound.js';

dotenv.config();
const app = express()
app.use(express.json());
const PORT = Number(process.env.PORT) || 3000;

app.use('/api/health', healthRouter)
app.use(notFoundHandler)
app.use(errorHandler)

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})