import { NextResponse } from 'next/server';

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
  assignee: { login: string } | null;
  user: { login: string };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const repo = searchParams.get('repo');
  const clientToken = searchParams.get('token');
  const perPage = searchParams.get('per_page') || '100';

  // Use client token if it's a real token (not 'server-managed' placeholder), otherwise fall back to server token
  const token = (clientToken && clientToken !== 'server-managed')
    ? clientToken
    : process.env.GITHUB_TOKEN;

  if (!repo) {
    return NextResponse.json({ error: 'Repository required' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json(
      { error: 'No GitHub token configured. Add GITHUB_TOKEN to .env.local or configure in Settings.' },
      { status: 401 }
    );
  }

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
    };

    // Use GitHub search API for query, or list issues if no query
    let url: string;
    if (query.trim()) {
      // Search issues in the repo
      const searchQuery = encodeURIComponent(`${query} repo:${repo} is:issue`);
      url = `https://api.github.com/search/issues?q=${searchQuery}&per_page=${perPage}`;
    } else {
      // List recent open issues
      url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=${perPage}&sort=updated`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'GitHub authentication failed' },
          { status: 401 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Repository ${repo} not found` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Normalize response format (search returns { items }, list returns array)
    const issues: GitHubIssue[] = (data.items || data)
      .filter((issue: GitHubIssue & { pull_request?: unknown }) => !issue.pull_request)
      .map((issue: GitHubIssue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        html_url: issue.html_url,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        labels: issue.labels,
        assignee: issue.assignee,
        user: issue.user,
      }));

    return NextResponse.json({ issues });
  } catch (error) {
    console.error('[github/issues] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500 }
    );
  }
}
