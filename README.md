# LMS Parser

MVP веб-приложения для Moodle: показывает задания, статусы сдачи, прогресс, баллы по курсам и позволяет запускать экспорт в PDF.

## Быстрый старт

1. Скопируйте переменные окружения:

```bash
cp .env.example .env
```

1. Запустите сервисы:

```bash
docker compose up --build
```

1. Откройте UI: `http://localhost:3000`
1. API доступен по: `http://localhost:4000`

## Что уже реализовано

- Подключение к Moodle по URL + логин + пароль.
- Попытка автоопределения версии Moodle через `core_webservice_get_site_info`.
- Дашборд с заданиями и тестами (quiz) и статусами.
- Прогресс по задачам и тестам + отдельный счётчик `сдано, но не проверено`.
- Вкладка курсов с баллами `earned/max`.
- Проваливание в конкретный курс со списком всех заданий и тестов.
- Запуск PDF-экспорта (курс/раздел/все) через очередь worker с выгрузкой текстового содержимого материалов.

## Ограничения текущего этапа

- На этом этапе основная бизнес-данные хранятся в памяти API-процесса (без персистентной БД), а пользовательские сессии сохраняются в Redis.
- Для экспорта используются текстовые данные модулей `resource`, `page`, `label`, `book`; для PDF/DOCX выполняется извлечение текста.
- Для некоторых Moodle-инстансов может потребоваться дополнительный fallback-парсинг.
- Время жизни сессии настраивается через `SESSION_TTL_SECONDS` (по умолчанию 7 дней, продлевается при активном использовании).

## CI/CD: публикация образов в GitHub Packages (GHCR)

В репозитории добавлен workflow [Docker Publish](.github/workflows/docker-publish.yml), который на каждый push:

- собирает 3 образа: `api`, `worker`, `web`;
- публикует их в GitHub Container Registry (Packages) как:
- `ghcr.io/<owner>/lms-parser-api:<commit_sha>` и `:latest`
- `ghcr.io/<owner>/lms-parser-worker:<commit_sha>` и `:latest`
- `ghcr.io/<owner>/lms-parser-web:<commit_sha>` и `:latest`

`latest` публикуется только для default branch.

### Что важно настроить в GitHub

1. В Actions должны быть разрешены workflow в репозитории.
1. Для `GITHUB_TOKEN` должна быть доступна запись пакетов (workflow уже использует `permissions: packages: write`).
1. (Опционально) Добавьте repository variable `VITE_API_URL`, если web-образ должен собираться с публичным URL API (по умолчанию `http://localhost:4000`).

## Пример docker-compose с внешними образами

Добавлен файл [docker-compose.ghcr.yml](docker-compose.ghcr.yml), который использует опубликованные образы из GHCR.

В нем используются переменные:

- `GHCR_OWNER` (по умолчанию `m1xxos`)
- `IMAGE_TAG` (по умолчанию `latest`, можно указать commit SHA)

Запуск:

```bash
export GHCR_OWNER=m1xxos
export IMAGE_TAG=latest
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Если хотите фиксированную (immutable) поставку, замените тег `latest` на конкретный commit SHA в `image:`.
