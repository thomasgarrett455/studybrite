**Project Name**

Study Spark (Name still pending)

**Team with Contact information**

Thomas Garrett - (661) 345-1667

**Stakeholders with Contact information**

Adam Virto - Student (661) 300-1794

Nathan Goulding - Student (909) 222-8700

Richard Goulding - Parent (909) 222-8700

Matthew Manley - Professor
[[mmanley@byui.edu]{.underline}](mailto:mmanley@byui.edu)

**Project Purpose**

Most students today use AI in their learning. Studies show that
unrestricted AI use negatively impacts learning outcomes --- creative
thinking and long-term retention are two areas particularly affected. At
the same time, students who avoid AI altogether risk falling behind
their peers. Without guardrails, AI is poised to harm nearly every
student unless extreme caution is exercised. My project aims to solve
this by giving students an AI-powered learning and study platform
designed to enhance, rather than diminish, learning outcomes.

**Background / Prior Knowledge**

I\'m a beginner in many of the technologies this project will use,
though I\'m approaching an intermediate level in some. When it comes to
integrating AI, I\'m a novice --- I\'ve only built one AI project, a
simple chatbot. I have no prior experience with vectorization or
embeddings, so I have a lot to learn there.

In my research, I haven\'t found any companies doing exactly what I\'m
proposing. MagicSchool is an AI assistant for teachers, and a startup
called alice.tech is similar to my project and will likely share some
features. However, my project will differentiate itself by focusing on
how each individual user learns best, and by adding a study-plan
feature.

**Description**

My project is an AI-powered learning management system. It will give AI
the proper guardrails to help students improve their learning outcomes
without spending more time studying. The platform will let students
create classroom spaces, each tied to specific context such as a course
syllabus that the AI will always reference. Within each classroom,
students can upload notes, slides, lecture audio, textbook excerpts, and
any open-source material they choose.

Users will be able to use AI to generate quizzes, flashcards, diagrams,
chatbots, and more. The AI will have access to quiz results and chatbot
interactions, allowing it to recognize which topics a student has
mastered and which still need work. Users will also create study plans,
and the AI can make suggestions based on the user\'s current
understanding of each topic and any deadlines they\'ve set.

**Significance**

This project is significant on two fronts. First, integrating this many
technologies into a fast, responsive, well-functioning platform will be
impressive to potential employers. Second, and more importantly, it has
the potential to help every student learn better and achieve more.

**New Computer Science Concepts**

Embeddings: To give the AI as much context as possible, users will be
able to upload pictures of notes, slides, and similar materials, which
will be converted into numerical representations of their meaning. These
representations help the AI reason about related topics more
effectively.

Vector Database: The embeddings created from uploaded materials will be
stored in a vector database, making the AI faster and more efficient at
retrieval. For example, when a user wants to generate a quiz on specific
material, the AI can use the database to pull only the relevant content,
saving time and resources.

**Interestingness**

I\'m very excited about this project because I genuinely believe it\'s
something people will use and that will actually help them. Many of the
projects I\'ve worked on so far have been geared toward learning
specific coding topics, but this one is energizing because it has the
potential for real-world impact.

**Milestones, Tasks, and Schedule**

Milestone 1 (Weeks 1--2)

- End-to-end RAG in a single script: take one PDF, chunk it, embed with
  OpenAI, store in Pinecone, query it, and get an answer from an LLM.
  Throwaway code. (6h)

- Multimodal extraction: send a photo of my own handwritten notes to
  Claude/GPT-4o and get back clean markdown. Test with 5+ real samples.
  (3h)

- Project repo setup: monorepo structure, TypeScript configs for both
  client and server, ESLint, Tailwind, Express skeleton. (5h)

- Read Cognito and React docs; watch one good tutorial end-to-end. (4h)

Milestone 2 (Weeks 3--4)

- Design DB schema: users, classrooms, uploads, quizzes, quiz_questions,
  flashcards. Diagram it before writing SQL. (3h)

- Set up MySQL locally with migrations tooling (Prisma). (4h)

- Express + TS API skeleton with router structure, error middleware, and
  request validation. (3h)

- Cognito integration: JWT verification middleware on the backend,
  Hosted UI flow on the frontend. (4h)

- Classroom CRUD: create, list, and view --- backend endpoints plus a
  minimal frontend. (4h)

Milestone 3 (Weeks 5--7)

- S3 bucket and IAM policy for uploads; pre-signed URL endpoint. (5h)

- Frontend upload component: drag-and-drop, image preview, progress,
  error handling. (4h)

- Ingestion pipeline: on upload, call the LLM, get text back, and save
  to DB. (5h)

- Chunking logic: split extracted text into \~500-token overlapping
  chunks. (3h)

- Embedding and Pinecone storage with metadata (classroom_id, upload_id,
  chunk_index). (4h)

- Syllabus as a special \"always-included\" upload type --- flag it in
  the DB and always retrieve syllabus chunks alongside any query. (3h)

- Debug endpoint: POST /classrooms/:id/ask --- accepts a question,
  retrieves the top-k chunks, and returns them along with an LLM answer.
  (3h)

Milestone 4 (Weeks 8--10)

- Quiz generation endpoint: input is classroom_id plus scope (e.g.,
  \"uploads from week 3\" or a topic); output is a stored quiz with N
  questions, mixing multiple choice and short answer. (6h)

- Quiz storage and retrieval. (3h)

- Quiz-taking UI: one question at a time, with submit, score, and
  review. (5h)

- Flashcard generation endpoint, using the same retrieval pattern. (4h)

- Flashcard study UI: flip animation, mark known/unknown, basic
  spaced-repetition queue (don\'t build SM-2; just \"show unknowns more
  often\"). (5h)

- Prompt engineering pass. (4h)

Milestone 5 (Weeks 11--12)

- EC2 instance and security groups; deploy backend; set up a reverse
  proxy (Caddy or Nginx) with HTTPS. (6h)

- EC2-local database setup. (3h)

- Build frontend; deploy to S3 + CloudFront. (4h)

- Configure prod env vars, Cognito callback URLs, and CORS. End-to-end
  test on the deployed environment. (3h)

Milestone 6 (Weeks 13--14)

- UI polish pass: empty states, loading states, error messages, mobile
  layout sanity check. (6h)

- Bug fixes from running through the full app as a \"real user.\" (4h)

- Course deliverable: final requirements specification. (3h)

- Demo prep: write a 5--7 minute demo script and record a screencast as
  a backup in case something breaks live. (2h)

- Course deliverable: reflection document. (3h)

**Resources and Dependencies**

- Prepaid API keys from Anthropic and OpenAI: roughly \$30--50 for the
  semester.

- Accounts with Pinecone (free tier), AWS (free credits), GitHub (free),
  and Bruno (free, for API testing).

- Software: MySQL, Node, React, Tailwind, VS Code, Windows OS.

- The project will be developed on my PC and then deployed to AWS.

**Risks**

- Converting images into embeddings, storing them in a database, and
  exposing them to an LLM via API.

- Copyright concerns around students uploading slides, syllabi, and
  similar materials.

- Extracting and embedding poor handwriting may prove difficult.

- Ensuring the quality of generated quizzes and flashcards.

- Cost: testing could become more expensive than planned if fine-tuning
  the AI models proves troublesome.
