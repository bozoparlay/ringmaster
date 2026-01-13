import { NextResponse } from 'next/server';

interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  labels: Array<{ name: string; color: string }>;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const repo = searchParams.get('repo');
  const token = searchParams.get('token');

  if (!repo) {
    return NextResponse.json({ error: 'Repository required' }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Use GitHub search API for query, or list issues if no query
    let url: string;
    if (query.trim()) {
      // Search issues in the repo
      const searchQuery = encodeURIComponent(`${query} repo:${repo} is:issue`);
      url = `https://api.github.com/search/issues?q=${searchQuery}&per_page=20`;
    } else {
      // List recent open issues
      url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=20&sort=updated`;
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
        state: issue.state,
        html_url: issue.html_url,
        created_at: issue.created_at,
        labels: issue.labels,
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
