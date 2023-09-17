url="$1"

# Use wget to follow redirects and retrieve the headers
headers=$(wget --max-redirect 0 --spider -S "$url" 2>&1)

# Extract the Location header
location_header=$(echo "$headers" | grep -i "Location:")

if [ -n "$location_header" ]; then
    # Extract the redirected URL
    redirected_url=$(echo "$location_header" | awk '{print $2}' | tr -d '\r\n')

    # Parse the query parameters of the redirected URL
    query_params=$(echo "$redirected_url" | grep -o -E '\?[^#]+')

    if [ -n "$query_params" ]; then
        # Extract the response-content-disposition parameter value
        filename=$(echo "$query_params" | sed -n -e 's/.*response-content-disposition=\([^&]*\).*/\1/p' | sed 's/%20/ /g')

        if [ -n "$filename" ]; then
            # Remove double quotes if present
            filename=$(echo "$filename" | tr -d '"')
            echo "$filename"
        fi
    fi
fi
