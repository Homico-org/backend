# Homi Backend API

NestJS-based backend for the Homi marketplace platform.

## Tech Stack

- NestJS
- Express.js
- MongoDB with Mongoose
- JWT Authentication
- TypeScript

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your MongoDB connection string and JWT secret.

4. Start MongoDB (make sure MongoDB is running locally or use MongoDB Atlas)

5. Run the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user

### Pro Profiles
- `GET /pro-profiles` - Get all pro profiles (with filters)
- `GET /pro-profiles/:id` - Get specific pro profile
- `POST /pro-profiles` - Create pro profile (Pro only)
- `PATCH /pro-profiles/:id` - Update pro profile (Pro only)
- `GET /pro-profiles/my-profile` - Get current user's pro profile

### Portfolio
- `GET /portfolio/pro/:proId` - Get portfolio items for a pro
- `POST /portfolio` - Create portfolio item (Pro only)
- `PATCH /portfolio/:id` - Update portfolio item (Pro only)
- `DELETE /portfolio/:id` - Delete portfolio item (Pro only)

### Project Requests
- `GET /project-requests` - Get project requests
- `GET /project-requests/:id` - Get specific project request
- `POST /project-requests` - Create project request (Client only)
- `PATCH /project-requests/:id/status` - Update project status
- `PATCH /project-requests/:id/assign` - Assign project to pro

### Offers
- `GET /offers/project/:projectRequestId` - Get offers for a project
- `GET /offers/my-offers` - Get pro's offers (Pro only)
- `POST /offers` - Create offer (Pro only)
- `PATCH /offers/:id/status` - Update offer status

### Conversations & Messages
- `GET /conversations` - Get user's conversations
- `GET /messages/conversation/:conversationId` - Get messages
- `POST /messages` - Send message
- `PATCH /messages/:id/read` - Mark message as read

### Reviews
- `GET /reviews/pro/:proId` - Get reviews for a pro
- `GET /reviews/my-reviews` - Get client's reviews (Client only)
- `POST /reviews` - Create review (Client only)

## Database Models

- User (Client/Pro/Admin roles)
- ProProfile
- PortfolioItem
- ProjectRequest
- Conversation
- Message
- Offer
- Review
