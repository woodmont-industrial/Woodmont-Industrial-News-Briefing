# Architecture Documentation

## System Overview

The Woodmont Industrial News Feed follows a modular architecture designed for enterprise scalability and maintainability.

## Modular Structure

### src/feeds/
**Purpose**: RSS configuration and fetching logic
- Feed configuration management
- HTTP request handling with retries
- Content parsing and normalization
- Circuit breaker implementation

### src/filter/
**Purpose**: Article classification and filtering
- Geographic filtering (NJ primary, PA/TX/FL secondary)
- Content classification (industrial/CRE news, transactions, etc.)
- Domain validation and deduplication
- Business day filtering

### src/store/
**Purpose**: Data persistence and caching
- Article storage and retrieval
- Cache management with TTL
- Feed health monitoring
- Performance metrics tracking

### src/server/
**Purpose**: HTTP endpoints and API responses
- RESTful API endpoints
- RSS XML generation
- Newsletter HTML generation
- Static file serving

## Data Flow

```
RSS Sources → src/feeds/ → src/filter/ → src/store/ → src/server/ → Output
```

1. **Ingestion**: Feeds module fetches RSS content with error handling
2. **Filtering**: Filter module applies business rules and content classification
3. **Storage**: Store module persists articles with metadata and health metrics
4. **Output**: Server module generates RSS, JSON, and HTML outputs

## Key Design Patterns

### Circuit Breaker Pattern
- Prevents cascade failures from problematic feeds
- Automatic recovery with exponential backoff
- Health monitoring and alerting

### Modular Architecture
- Clear separation of concerns
- Independent testing and deployment
- Easy maintenance and feature addition

### Enterprise Error Handling
- Comprehensive logging and monitoring
- Graceful degradation
- Automatic recovery mechanisms

## Performance Considerations

- **Concurrent Processing**: Multiple feeds processed simultaneously
- **Caching Strategy**: Multi-level caching for optimal performance
- **Resource Management**: Connection pooling and timeout handling
- **Scalability**: Horizontal scaling ready architecture

## Security Measures

- **Input Validation**: All external content sanitized
- **Access Control**: API key authentication for admin functions
- **Data Privacy**: Only title, URL, date, source stored
- **Compliance**: Public repository security guidelines
