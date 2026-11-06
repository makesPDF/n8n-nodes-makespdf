# n8n-nodes-makespdf

An [n8n](https://n8n.io) community node for [makesPDF](https://makespdf.com/?ref=n8n). It turns markdown, a saved template or a template script into a PDF inside a workflow: an invoice from a form submission, a report from a spreadsheet, a letter from a CRM record.

Every PDF makesPDF produces is tagged and dual-compliant with PDF/A-2A and PDF/UA-1, so it is ready for archiving and for screen readers without a separate accessibility step.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Example workflows](#example-workflows)
- [Using it as an AI Agent tool](#using-it-as-an-ai-agent-tool)
- [Costs and limits](#costs-and-limits)
- [Development](#development)

## Installation

In n8n, open **Settings -> Community Nodes -> Install** and enter:

```
@makespdf/n8n-nodes-makespdf
```

See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for self-hosted setups.

## Credentials

The node uses a **makesPDF API** credential:

| Field    | Value                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| API Key  | A key from [makespdf.com/settings/api-keys](https://makespdf.com/settings/api-keys)        |
| Base URL | `https://makespdf.com`. Change it only if you were given a different makesPDF environment. |

The key is sent as `Authorization: Bearer <key>`. Saving the credential runs a connection test that lists your most recent render, which needs a valid key and costs nothing.

## Operations

### PDF -> Create From Markdown

Renders [GitHub-flavoured markdown](https://makespdf.com/docs/markdown) to a PDF: headings, lists, tables, code blocks with highlighting, images, footnotes, alerts and Mermaid diagrams.

| Parameter                       | Notes                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Markdown                        | The source text.                                                                                                           |
| Options -> Title                | PDF metadata title. Also names the file when File Name is empty.                                                           |
| Options -> Author               | PDF metadata author.                                                                                                       |
| Options -> Language             | BCP 47 tag such as `en`, `ja` or `zh-Hant`. Sets the PDF language and picks the built-in Chinese, Japanese or Korean font. |
| Options -> Page Size            | A3, A4, A5, Letter or Legal.                                                                                               |
| Options -> Theme                | GitHub (default) or Classic.                                                                                               |
| Options -> Font                 | Inter (default) or Noto Sans.                                                                                              |
| Options -> Page Numbers         | Footer page numbers: `Page 3 of 12`, `3 / 12` or `3`.                                                                      |
| Options -> Page Number Position | Left, Center or Right (default).                                                                                           |

### PDF -> Create From Template

Fills a template with data and renders it. Pick a template from the list (the makesPDF library and your own saved templates) or enter its ID, such as `invoice-classic`.

| Parameter        | Notes                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template         | From the list, or by ID.                                                                                                                                               |
| Data             | A JSON object of values for the template's placeholders, for example `{"customer": {"name": "Ada"}}`. Leave it as `{}` to use the sample data saved with the template. |
| Options -> Title | PDF metadata title. Also names the file when File Name is empty.                                                                                                       |

Browse the library at [makespdf.com/templates](https://makespdf.com/templates).

### PDF -> Create From Template Script

Renders a makesPDF template script (the builder DSL) with data, without saving it first. The script reference is [pdf-template-author.md](https://makespdf.com/skills/pdf-template-author.md).

| Parameter        | Notes                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| Template Script  | The script, for example `const template = doc(page(col(s("Hello {{name}}"))));` |
| Data             | A JSON object of values for the placeholders.                                   |
| Options -> Title | PDF metadata title. Also names the file when File Name is empty.                |

**Output of the three PDF operations.** Each input item produces one item with the PDF as binary data in the field named by **Put Output File in Field** (default `data`), named by **File Name**, else the title, else `document.pdf`. The item's JSON holds `fileName`, `sizeBytes`, `pageCount`, `artifactId` (download the same PDF again from your [render history](https://makespdf.com/settings/renders)), and `creditsDeducted` / `creditsRemaining` when the render was billed.

### Template -> Get Many

Lists templates as one item each: `templateId`, `name`, `description`, `category`, `tags`, `ownerUserId` (`null` for library templates), `createdAt`, `updatedAt`.

| Parameter           | Notes                                              |
| ------------------- | -------------------------------------------------- |
| Return All / Limit  | All templates, or up to Limit (default 50).        |
| Filters -> Owner    | All (default), Library or Mine.                    |
| Filters -> Category | For example `invoice`.                             |
| Filters -> Tags     | Comma-separated; a template must have all of them. |
| Filters -> Search   | Matches the template name and description.         |

### Markdown -> Validate

Checks markdown for accessibility problems without rendering it: heading order, images without alt text, and diagrams without a description. Returns `{ valid, issues, summary }`, where each issue has a `severity`, `message`, `path` and `rule`.

### Errors

A failed call shows makesPDF's own message and hint. A rejected key, missing credits and the rate limit each get a specific message. Turn on **Continue On Fail** to receive an `error` field on the item instead of stopping the workflow.

## Example workflows

The [`examples`](https://github.com/makesPDF/n8n-nodes-makespdf/tree/main/examples) folder holds workflows you can import. In n8n, open a new workflow, choose **... -> Import from File** (or paste the JSON onto the canvas), then pick your makesPDF credential on each makesPDF node.

| File                                                                                                                   | What it does                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`invoice-from-order.json`](https://github.com/makesPDF/n8n-nodes-makespdf/blob/main/examples/invoice-from-order.json) | Takes an order, works out line totals, tax and due date in a Code node, and fills the `invoice-classic` library template. Swap the **Order** node for your trigger: a form, a webhook or a shop. |
| [`markdown-report.json`](https://github.com/makesPDF/n8n-nodes-makespdf/blob/main/examples/markdown-report.json)       | Builds a markdown report with a table, an alert and a Mermaid pie chart, checks it for accessibility issues, then renders it with page numbers.                                                  |

Both write the PDF to the `data` binary field, ready for a Send Email, Google Drive or Write Files node.

## Using it as an AI Agent tool

The node can be attached to n8n's AI Agent as a tool, so an agent can list templates, validate markdown and render PDFs. The PDF operations return binary data, which the agent passes along rather than reads.

## Costs and limits

Rendering is billed in makesPDF credits: 1 credit per 10 pages, nothing on a failed render. Listing templates and validating markdown are free. See [pricing](https://makespdf.com/pricing) and the [API reference](https://makespdf.com/docs/api) for rate limits and size limits.

## Development

```sh
npm install
npm run dev     # n8n with this node, hot reload, on http://localhost:5678
npm run lint
npm run build
npm test
```

To point the node at a local makesPDF server, set the credential's Base URL to that server, for example `http://localhost:8788`.

### Releasing

Versions are published to npm only by the `Release` GitHub Actions workflow, with npm provenance, which n8n requires for verified community nodes.

1. Bump `version` in `package.json`, add a `CHANGELOG.md` entry, and merge to `main`.
2. Push a tag equal to the version, with no `v` prefix: `git tag 0.1.1 && git push origin 0.1.1`.

Run the workflow by hand from the Actions tab for a dry run that builds and packs with provenance and publishes nothing. npm refuses even a dry run for a version that is already published, so bump the version first.

The package's Trusted Publisher on npmjs.com names this repository and the workflow file `release.yml`, with the "npm publish" action allowed. A new Trusted Publisher expires if it does not publish within 2 days, so push the release tag soon after creating it.

## License

[MIT](LICENSE)
