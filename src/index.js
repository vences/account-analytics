// Inspired by https://developers.cloudflare.com/workers/tutorials/automated-analytics-reporting/
// Import required modules for email handling
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

export default {
  // HTTP request handler - This Handler is invoked when the Worker is accessed via HTTP
  async fetch(request, env, ctx) {
		const url = new URL(request.url)

		if (url.pathname == "/favicon.ico") {
			return new Response(`Success`, {
				status: 200,
			})
		}

    try {
			const results = [];
			const accounts = await fetchAccounts(env);
			for (const account of accounts) {
				try {
					const analyticsData = await fetchAnalytics(env, account.id);
					const zones = await fetchZones(env, account.id);
					const zonesAnalytics = await fetchZonesAnalytics(env, zones);
					const formattedContent = formatContent(
						analyticsData.data,
						analyticsData.formattedDate,
						zonesAnalytics,
						account
					);
					results.push(formattedContent)
				} catch (error) {
					console.error(error);
					continue;
				}
			}
      return new Response(results.join("\n"), {
        headers: { "Content-Type": "text/plain" },
      });
    } catch (error) {
      console.error("Error:", error);
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  },

  // Scheduled task handler - This Handler is invoked via a Cron Trigger
  async scheduled(event, env, ctx) {
    try {
      const analyticsData = await fetchAnalytics(env, env.CF_ACCOUNT_ID);
			const zones = await fetchZones(env, env.CF_ACCOUNT_ID);
			const zonesAnalytics = await fetchZonesAnalytics(env, zones); 
      const formattedContent = formatContent(
        analyticsData.data,
        analyticsData.formattedDate,
				zonesAnalytics,
				{ name: "1_Vence Org 🥇" }
      );
      await sendEmail(env, formattedContent);
      console.log("Analytics email sent successfully");
    } catch (error) {
      console.error("Failed to send analytics email:", error);
    }
  },
};

async function fetchAccounts(env) {
	// Get zones
	const accounts = await fetch(`https://api.cloudflare.com/client/v4/memberships?status=accepted&page=1&per_page=50&order=account.name&direction=desc`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
		},
	})

	const data = await accounts.json();
  if (data.errors.length > 0) {
    throw new Error(`API Error: ${JSON.stringify(data.errors)}`);
  }

	// Create an array to hold the results
	const results = [];

	// Iterate over the result array and extract ids and names
	for (const account of data.result) {
		results.push({
				name: account.account.name,
				id: account.account.id,
		});
	}

	return results;
}

async function fetchAnalytics(env, accountId) {
  // Calculate yesterday's date for the report and format it for display
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split("T")[0];
  const formattedDate = yesterday.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Fetch analytics data from Cloudflare's GraphQL Analytics API
  const response = await fetch(`https://api.cloudflare.com/client/v4/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
                query GetAnalytics($accountTag: String!, $date: String!) {
                    viewer {
                        accounts(filter: { accountTag: $accountTag }) {
                            httpRequestsOverviewAdaptiveGroups(limit: 1, filter: { date: $date }) {
                                sum {
                                    requests
                                    bytes
                                    cachedRequests
                                    cachedBytes
                                }
                            }
                        }
                    }
                }
            `,
      variables: {
        accountTag: accountId,
        date: dateString,
      },
    }),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }

	if (data.data.viewer.accounts[0].httpRequestsOverviewAdaptiveGroups.length == 0) {
		throw new Error(`account ${accountId}: empty SKIP`)
	}

  return { data, formattedDate };
}

async function fetchZones(env, accountId) {
	// Get zones
	const allZones = await fetch(`https://api.cloudflare.com/client/v4/zones?account.id=${accountId}&order=method&direction=desc&page=1&per_page=50`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
		},
	})

	const data = await allZones.json();
  if (data.errors.length > 0) {
    throw new Error(`API Error: ${JSON.stringify(data.errors)}`);
  }

	if (data.result.length == 0) {
		throw new Error(`No zone for account ${accountId}: SKIP`)
	}

	// Create an array to hold the results
	const results = [];

	// Iterate over the result array and extract ids and names
	for (const zone of data.result) {
		// Format the response to include name and GraphQL response
		results.push({
				name: zone.name,
				id: zone.id,
		});
	}

	return results;
}

async function fetchZonesAnalytics(env, zones) {
	// Create an array to hold the results
	const results = [];

	// Iterate over the result array and extract ids and names
	for (const zone of zones) {
		const graphQLResponse = await fetchZoneAnalytics(env, zone.id);
		
		// Format the response to include name and GraphQL response
		results.push({
				zone: zone.name,
				analytics: graphQLResponse // Include the response from GraphQL
		});
	}

	return results;
}

async function fetchZoneAnalytics(env, zoneId) {
	// Calculate yesterday's date for the report and format it for display
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split("T")[0];
  const formattedDate = yesterday.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Fetch analytics data from Cloudflare's GraphQL Analytics API
  const response = await fetch(`https://api.cloudflare.com/client/v4/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
                query GetAnalytics($zoneTag: String!, $date: String!) {
                    viewer {
                        zones(filter: { zoneTag: $zoneTag }) {
                            httpRequestsOverviewAdaptiveGroups(limit: 1, filter: { date: $date }) {
                                sum {
                                    requests
                                    bytes
                                    cachedRequests
                                    cachedBytes
                                }
                            }
                        }
                    }
                }
            `,
      variables: {
        zoneTag: zoneId,
        date: dateString,
      },
    }),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }

  return { data, formattedDate };
}

function formatContent(analyticsData, formattedDate, zonesAnalytics, account) {
  const stats =
    analyticsData.data.viewer.accounts[0].httpRequestsOverviewAdaptiveGroups[0]?.sum ?? {requests: 0, cachedRequests: 0, bytes: 0, cachedBytes: 0};

  // Helper function to format bytes into human-readable format
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };
	
	// Format Zones Analytics 
	const zones = zonesAnalytics
		 .filter(zone => {
				const sum = zone.analytics.data.data.viewer.zones[0].httpRequestsOverviewAdaptiveGroups[0]?.sum;
				return sum && typeof sum?.requests === 'number' && typeof sum?.bytes === 'number';
		 })
	   .sort((a, b) => b.analytics.data.data.viewer.zones[0].httpRequestsOverviewAdaptiveGroups[0].sum.requests - a.analytics.data.data.viewer.zones[0].httpRequestsOverviewAdaptiveGroups[0].sum.requests)
	   .map((b) => `  ${b.zone}: ${b.analytics.data.data.viewer.zones[0].httpRequestsOverviewAdaptiveGroups[0].sum.requests} requests / ${formatBytes(b.analytics.data.data.viewer.zones[0].httpRequestsOverviewAdaptiveGroups[0].sum.bytes)}`)
		 .join("\n");

  // Return formatted report
  return `
CLOUDFLARE ANALYTICS FOR ${account.name}
========================================
Generated for: ${formattedDate}

TRAFFIC
-------
    Total Requests: ${stats.requests.toLocaleString()}
    Cached Requests: ${stats.cachedRequests.toLocaleString()}
    Cache Rate: ${((stats.cachedRequests / stats.requests) * 100).toFixed(1)}%

BANDWIDTH
---------
    Total Bandwidth: ${formatBytes(stats.bytes)}
    Cached Bandwidth: ${formatBytes(stats.cachedBytes)}
    Cache Rate: ${((stats.cachedBytes / stats.bytes) * 100).toFixed(1)}%

ZONES ANALYTICS
------------
${zones}
`;
}

async function sendEmail(env, content) {
  // Create and configure email message
  const msg = createMimeMessage();

  msg.setSender({
    name: env.SENDER_NAME,
    addr: env.SENDER_EMAIL,
  });

  msg.setRecipient(env.RECIPIENT_EMAIL);
  msg.setSubject(env.EMAIL_SUBJECT);

  msg.addMessage({
    contentType: "text/plain",
    data: content,
  });

  // Send email using Cloudflare Email Routing service
  const message = new EmailMessage(
    env.SENDER_EMAIL,
    env.RECIPIENT_EMAIL,
    msg.asRaw(),
  );

  try {
    await env.ANALYTICS_EMAIL.send(message);
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}