import { NextResponse } from 'next/server';

interface CreateIssueRequest {
  title: string;
  body?: string;
  labels?: string[];
  repo: string;
  token: string;
}

interface GitHubIssueResponse {
  number: number;
  html_url: string;
  title: string;
  state: string;
}

export async function POST(request: Request) {
  try {
    const body: CreateIssueRequest = await request.json();
    const { title, body: issueBody, labels, repo, token } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!repo) {
      return NextResponse.json({ error: 'Repository is required' }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: 'GitHub token is required' }, { status: 400 });
    }

    // Create issue via GitHub API
    const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: issueBody || '',
        labels: labels || [],
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'GitHub authentication failed' },
          { status: 401 }
        );
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Permission denied. Check your GitHub token permissions.' },
          { status: 403 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Repository ${repo} not found` },
          { status: 404 }
        );
      }
      if (response.status === 422) {
        const errorData = await response.json();
        return NextResponse.json(
          { error: `Validation failed: ${errorData.message || 'Invalid request'}` },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const issue: GitHubIssueResponse = await response.json();

    return NextResponse.json({
      success: true,
      issue: {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
      },
    });
  } catch (error) {
    console.error('[github/create-issue] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create issue' },
      { status: 500 }
    );
  }
}
