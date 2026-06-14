import express from 'express';
import dotenv from 'dotenv';
import { config } from './config.js'
import healthRouter from "./routes/health.routes.js";
import errorHandler from "./middleware/errorHandler.js"
import notFoundHandler from './middleware/notFound.js';
import authRouter from './routes/auth.routes.js';
import classroomRouter from './routes/classroom.routes.js';
import materialRouter from './routes/material.routes.js';
import chatRouter from './routes/chat.routes.js';


dotenv.config();
const app = express()
app.use(express.json());


app.use('/api/health', healthRouter)

app.use('/api/auth', authRouter)

app.use('/api/classrooms', classroomRouter)

app.use('/api/classrooms', materialRouter)

app.use('/api/classrooms', chatRouter)

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`)
})