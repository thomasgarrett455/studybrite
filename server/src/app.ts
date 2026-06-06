import express from 'express';
import dotenv from 'dotenv';
import { config } from './config.js'
import healthRouter from "./routes/health.routes.js";
import errorHandler from "./middleware/errorHandler.js"
import notFoundHandler from './middleware/notFound.js';
import authRouter from './routes/auth.routes.js';

dotenv.config();
const app = express()
app.use(express.json());


app.use('/api/health', healthRouter)

app.use('/api/auth', authRouter)

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`)
})