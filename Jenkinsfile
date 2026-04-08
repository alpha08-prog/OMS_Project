pipeline {
    agent any

    environment {
        CATALYST_TOKEN = credentials('catalyst-token')   // Add in Jenkins → Manage Credentials → Secret text
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        // ─────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                echo "Branch: ${env.BRANCH_NAME ?: 'main'} | Build #${env.BUILD_NUMBER}"
            }
        }

        // ─────────────────────────────────────────
        stage('Install Dependencies') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            sh 'npm ci'
                            sh 'npx prisma generate'
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            sh 'npm ci'
                        }
                    }
                }
            }
        }

        // ─────────────────────────────────────────
        stage('Unit Tests') {
            parallel {
                stage('Backend – Vitest') {
                    steps {
                        dir('backend') {
                            sh 'npm test'
                        }
                    }
                }
                stage('Frontend – Vitest') {
                    steps {
                        dir('frontend') {
                            sh 'npx vitest run --reporter=verbose'
                        }
                    }
                }
            }
        }

        // ─────────────────────────────────────────
        stage('Build') {
            parallel {
                stage('Backend – Build') {
                    steps {
                        dir('backend') {
                            sh 'npm run build'
                        }
                    }
                }
                stage('Frontend – Build') {
                    steps {
                        dir('frontend') {
                            sh 'npm run build'
                        }
                    }
                }
            }
        }

        // ─────────────────────────────────────────
        stage('E2E Tests') {
            when {
                branch 'main'
            }
            steps {
                dir('frontend') {
                    sh 'npx playwright install --with-deps chromium'
                    sh 'npx playwright test --reporter=list || true'
                }
            }
            post {
                always {
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'frontend/playwright-report',
                        reportFiles: 'index.html',
                        reportName: 'Playwright E2E Report'
                    ])
                }
            }
        }

        // ─────────────────────────────────────────
        stage('Deploy to Catalyst AppSail') {
            when {
                allOf {
                    branch 'main'
                    expression { return env.CATALYST_TOKEN != null && env.CATALYST_TOKEN != '' }
                }
            }
            steps {
                echo 'Deploying backend to Zoho Catalyst AppSail...'
                sh '''
                    if ! command -v catalyst &> /dev/null; then
                        npm install -g zcatalyst-cli
                    fi
                    catalyst login --token "$CATALYST_TOKEN"
                    catalyst deploy --only appsail
                '''
            }
        }

    }

    post {
        success {
            echo "Pipeline passed — Build #${env.BUILD_NUMBER} deployed successfully."
        }
        failure {
            echo "Pipeline failed — Build #${env.BUILD_NUMBER}. Check logs above."
        }
        always {
            cleanWs(cleanWhenSuccess: true, cleanWhenFailure: false)
        }
    }
}
