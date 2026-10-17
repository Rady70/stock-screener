# stockscreen-mcp

> MarketLab local repair of upstream 0.1.1 at `2fcfc152fbf4ecfdaedad23bce351bd3d90ce4d6`.
> This working checkout includes local fixes; installing the published PyPI package
> or launching the bundle below does not include them. The evaluated local environment
> installs this directory in editable mode. No public release has been made.

<!-- mcp-name: io.github.xang1234/stockscreen-mcp -->

Daily stock screens, relative-strength ratings, market breadth and industry group rankings for **12 markets**, available to Claude, Cursor, VS Code or any other [MCP](https://modelcontextprotocol.io/) client.

- No API keys and no server to run.
- It reads the snapshot that the open-source [stock-screener](https://github.com/xang1234/stock-screener) project publishes after every market close.
- That's the same data as the [live demo](https://xang1234.github.io/stock-screener/).

```bash
uvx stockscreen-mcp
```

**Markets:** United States, Canada, Germany, Hong Kong, mainland China, Japan, Korea, Taiwan, India, Singapore, Malaysia and Australia.

## What you can ask

- "Which stocks pass the Minervini trend template in the US today, and which of them are in top-20 industry groups?"
- "Run the CANSLIM screen for Japan and show the five strongest by 3-month RS."
- "How healthy is the US market right now? Exposure, distribution days, breadth."
- "What are the leading industry groups this week, and which groups moved up the most?"
- "Tell me everything the scan knows about NVDA, and which screens it passes."
- "Find Hong Kong stocks with RS above 90, in stage 2, with quarterly EPS growth over 25%."

## Tools

All tools are read-only.

| Tool | What it returns |
|---|---|
| `list_markets` | Markets in the current publish, with each one's data date, status and features |
| `list_screens` | The 28 preset screens and their exact rules: Minervini, CANSLIM, VCP, cup with handle, high tight flag, momentum, IPOs and more |
| `run_screen` | Published preset rules and/or custom filters, sorted, with the match count; malformed numeric values are excluded locally. Optional `require_current` rejects late or unknown publications |
| `get_stock` | One stock: RS ratings (overall, 1M, 3M, 12M), stage, screener scores, growth, group rank, setup and pattern fields, and the screens it passes |
| `market_overview` | Exposure score and stance, distribution days, follow-through day, StockBee-style breadth (4% movers, 5/10-day ratios, T2108, 52-week highs/lows), key index moves, top groups |
| `group_rankings` | IBD-style industry groups ranked by relative strength, with 1W/1M/3M/6M rank changes and weekly movers. Pass a group for its rank history and strongest stocks |

### Reading the data

- **RS ratings** (`rs_rating`, `rs_rating_1m/3m/12m`) are percentiles from 1 to 99 *within the stock's own market*, where 99 is the strongest.
- **Group rank 1** is the strongest group.
- **Every market result has an `as_of_date` and `status`:** `current`, `late` or `unknown`.
  Related pages and their publication metadata are read from the same snapshot.
  `snapshot_id`, `published_at`, `source` and `publication` identify that snapshot.
  `run_screen(require_current=True)` rejects late, unknown or date-mismatched publications.
  These remain publisher freshness assessments; they do not independently certify exchange calendars.
- **Missing and zero differ:** stock and screen results retain nulls, `field_availability`,
  `data_status`, growth basis/cadence and RS formula/run/universe metadata. `complete` is scan
  status, not proof of complete fundamentals or company classification; funds can be present.
  `get_stock` preserves raw nulls; screen aliases can still derive USD capitalization from
  a USD local capitalization. Numeric ranges reject nonnumeric, nonfinite and underflowed
  values; ordinary numeric strings and actual zero remain supported.
- **Methodology:** responses identify the published RS formula and the project's CANSLIM-style
  score. Its annual-earnings component uses a year-over-year proxy, not multi-year annual history.
  Growth-field interpretation follows `growth_metric_basis`.
- This is end-of-day data with nothing intraday, never fetched live from price providers.

## Setup

The server needs [uv](https://docs.astral.sh/uv/getting-started/installation/), which provides `uvx`.

**Claude Code**

```bash
claude mcp add stockscreen -- uvx stockscreen-mcp
```

**Claude Desktop**: add to `claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "stockscreen": { "command": "uvx", "args": ["stockscreen-mcp"] }
  }
}
```

**Cursor**: add the same `mcpServers` entry to `~/.cursor/mcp.json`.

**VS Code**: add to `.vscode/mcp.json`.

```json
{
  "servers": {
    "stockscreen": { "type": "stdio", "command": "uvx", "args": ["stockscreen-mcp"] }
  }
}
```

**Codex CLI**: add to `~/.codex/config.toml`.

```toml
[mcp_servers.stockscreen]
command = "uvx"
args = ["stockscreen-mcp"]
```

To run the newest version from `main` rather than the latest release, replace `stockscreen-mcp` in `args` with `--from`, `git+https://github.com/xang1234/stock-screener#subdirectory=stockscreen-mcp`, `stockscreen-mcp`.

## How it works

- **Data source:** the server reads the JSON that the static site publishes to GitHub Pages. The root `manifest.json` points at the current publish.
- **Download and caching:** each market's scan is downloaded once, on first use (US is about 7 MB compressed), and kept in memory. The two most recently used markets stay cached, and the cache refreshes when a new publish appears.
- **Data URL:** set `STOCKSCREEN_DATA_URL` to read from another publish, such as a fork's GitHub Pages site.

## Development

```bash
cd stockscreen-mcp
uv run pytest                                      # unit tests, no network
STOCKSCREEN_LIVE=1 uv run pytest -m live           # against the real publish
```

### Releasing

1. Bump `__version__` in `src/stockscreen_mcp/__init__.py`. Bump the same version in `server.json` (both `version` fields) and in `mcpb/manifest.json` and `mcpb/pyproject.toml`. `tests/test_packaging.py` fails if they drift.
2. Push a `stockscreen-mcp-v<version>` tag. `.github/workflows/stockscreen-mcp-release.yml` publishes to PyPI and then to the [MCP registry](https://registry.modelcontextprotocol.io/), through `stockscreen-mcp-registry.yml` with GitHub OIDC.
3. **Bundles** (needs Node 20+, which the Smithery CLI requires; `smithery_bundle.py` checks it), built from `mcpb/`:
   - **Claude Desktop:** `npx @anthropic-ai/mcpb pack . stockscreen-mcp.mcpb` builds an MCPB `uv` bundle.
   - **Smithery:** its CLI can't read the `uv` type yet ([smithery-cli#801](https://github.com/arcadeai-labs/smithery-cli/issues/801)). `python smithery_bundle.py` packs a copy typed `python` as `stockscreen-mcp-smithery.mcpb`.
   - **Publish to Smithery:** `smithery mcp publish stockscreen-mcp-smithery.mcpb -n davidten7/stockscreen-mcp`, using the maintainer's Smithery namespace.

## License and disclaimer

Apache-2.0. This is screening data for education and research, **not investment advice**.
