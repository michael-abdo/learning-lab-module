# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project structure reorganization for better maintainability
- Configuration management with environment-specific config files
- MIT License
- Project logos directory
- Comprehensive project structure documentation
- README badges for build status, coverage, and version

### Changed
- Moved duplicate directories to centralized locations
- Updated package.json with proper metadata and repository information
- Standardized file naming conventions (lowercase with hyphens)

### Fixed
- Removed sensitive files (private keys) from repository
- Fixed test import paths after directory reorganization

### Security
- Removed private key file from deployment directory

## [1.0.0] - 2024-03-10

### Added
- Initial release of Learning Lab Module
- Document upload and processing pipeline
- MongoDB Vector Search integration
- Multi-format document support (PDF, Word, Excel, images, audio, video)
- AWS service integrations (S3, Textract, Transcribe, Rekognition)
- LLM integration for answer generation (OpenAI, Anthropic, Google)
- Asynchronous job processing with Bull/Redis
- JWT-based authentication
- Content moderation capabilities
- Comprehensive test suite

### Features
- RESTful API for document management
- Text extraction from various file formats
- Vector embeddings generation and storage
- Semantic similarity search
- Context-aware answer generation
- Real-time processing status updates
- Advanced error recovery mechanisms

[Unreleased]: https://github.com/runtheons/learning-lab-module/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/runtheons/learning-lab-module/releases/tag/v1.0.0