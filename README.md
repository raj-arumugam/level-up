# Portfolio Tracker

A comprehensive investment portfolio tracking application that allows users to track their stock holdings, analyze performance across different sectors, and receive automated daily updates.

## Features

- **Portfolio Management**: Add, edit, and remove stock positions with purchase details
- **Real-time Data**: Integration with financial APIs for current stock prices
- **Analytics Dashboard**: Sector allocation, market cap distribution, and performance metrics
- **Daily Updates**: Automated email notifications with portfolio performance summaries
- **Historical Analysis**: Track portfolio performance over time with benchmark comparisons

## Technology Stack

### Backend
- Node.js with Express.js and TypeScript
- PostgreSQL database with Prisma ORM
- JWT authentication with bcrypt
- Market data from Alpha Vantage API
- Email notifications with Nodemailer
- Scheduled tasks with node-cron

### Frontend
- React with TypeScript
- Material-UI for components
- Chart.js for data visualizations
- React Router for navigation
- Axios for API communication

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Docker and Docker Compose
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd portfolio-tracker
```

2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

4. Set up environment variables:
```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

5. Update the `.env` files with your configuration:
   - Database connection string
   - JWT secret key
   - Alpha Vantage API key
   - Email configuration

### Development

#### Using Docker Compose (Recommended)
```bash
# Start all services (database, backend, frontend)
docker-compose up

# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Manual Setup
1. Start PostgreSQL database:
```bash
docker-compose up postgres -d
```

2. Run database migrations:
```bash
npx prisma migrate dev
```

3. Start the backend server:
```bash
npm run dev:backend
```

4. Start the frontend development server:
```bash
npm run dev:frontend
```

### Testing

```bash
# Run backend tests
npm test

# Run tests in watch mode
npm run test:watch

# Run frontend tests
cd frontend
npm test
```

### Building for Production

```bash
# Build both backend and frontend
npm run build

# Build backend only
npm run build:backend

# Build frontend only
npm run build:frontend
```

## API Documentation

The API will be available at `http://localhost:3001/api` when running locally.

### Endpoints
- `GET /health` - Health check
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/portfolio` - Get user portfolio
- `POST /api/positions` - Add stock position
- `PUT /api/positions/:id` - Update stock position
- `DELETE /api/positions/:id` - Delete stock position
- `GET /api/analytics/sectors` - Get sector allocation
- `GET /api/analytics/performance` - Get performance metrics

## Environment Variables

### Backend (.env)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `ALPHA_VANTAGE_API_KEY` - API key for market data
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` - Email configuration
- `PORT` - Server port (default: 3001)

### Frontend (frontend/.env)
- `REACT_APP_API_URL` - Backend API URL
- `REACT_APP_ENABLE_ANALYTICS` - Enable analytics features
- `REACT_APP_ENABLE_NOTIFICATIONS` - Enable notification features

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.