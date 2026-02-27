from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0002_split_guest_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservation',
            name='is_settled',
            field=models.BooleanField(default=False),
        ),
    ]
